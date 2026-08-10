/**
 * OCR Proxy API
 * 
 * Receives passport images from the extension and processes them using OpenAI Vision API.
 * Extracts passport data fields and returns structured JSON.
 * 
 * Note: Images are never stored - processed immediately and discarded.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireApiUser } from '@/lib/api-auth';

// ============================================================================
// CONFIGURATION
// ============================================================================

// OpenAI client - lazily initialized to avoid build-time errors
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

// ============================================================================
// TYPES
// ============================================================================

interface PassportData {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  passportNumber: string | null;
  nationality: string | null;
  dateOfBirth: {
    day: string | null;
    month: string | null;
    year: string | null;
  };
  gender: string | null;
  dateOfIssue: {
    day: string | null;
    month: string | null;
    year: string | null;
  };
  dateOfExpiry: {
    day: string | null;
    month: string | null;
    year: string | null;
  };
  placeOfBirth: string | null;
  issuingAuthority: string | null;
  passportType: string | null; // "passport" or "passport card"
  confidence: number;
}

// ============================================================================
// OCR PROMPT
// ============================================================================

const OCR_SYSTEM_PROMPT = `You are a passport OCR system. Extract all relevant information from the passport image provided.

IMPORTANT NOTES:
- The image may be rotated 90, 180, or 270 degrees from normal orientation. Mentally rotate it to read correctly.
- Passports have a Machine Readable Zone (MRZ) at the bottom - two lines of OCR-B font characters. This is the most reliable data source.
- Read the MRZ FIRST, then cross-reference with the visual printed fields above.

MRZ Format (Type P passport):
- Line 1: P<COUNTRY<<SURNAME<<GIVEN_NAMES<<<<<<<<<<<<<<<<<<
- Line 2: PASSPORT_NO<CHECK<NATIONALITY<YYMMDD<CHECK<SEX<YYMMDD<CHECK

Return the data as a valid JSON object with the following structure:
{
  "firstName": "string or null",
  "middleName": "string or null (include all middle names)",
  "lastName": "string or null",
  "passportNumber": "string or null",
  "nationality": "string or null (full country name)",
  "dateOfBirth": {
    "day": "string (2 digits) or null",
    "month": "string (2 digits) or null",
    "year": "string (4 digits) or null"
  },
  "gender": "string (M/F) or null",
  "dateOfIssue": {
    "day": "string (2 digits) or null",
    "month": "string (2 digits) or null",
    "year": "string (4 digits) or null"
  },
  "dateOfExpiry": {
    "day": "string (2 digits) or null",
    "month": "string (2 digits) or null",
    "year": "string (4 digits) or null"
  },
  "placeOfBirth": "string or null",
  "issuingAuthority": "string or null (country or authority name)",
  "passportType": "string or null (either 'passport' for a full passport book or 'passport card' for a passport card)",
  "confidence": 0.0 to 1.0 (your confidence in the extraction accuracy)
}

Extraction Rules:
- Extract exactly what is shown on the passport
- Use null for any fields you cannot read or find
- Names should be in their original case (usually uppercase on passports)
- Dates should be extracted as separate day/month/year strings
- Passport numbers may contain letters and numbers
- Determine if the document is a passport book (full passport) or a passport card (smaller card format) based on the image
- For dates in MRZ: YYMMDD format - convert YY to 4-digit year (00-30 = 2000s, 31-99 = 1900s for DOB; always 2000s for expiry)`;

// ============================================================================
// API HANDLER
// ============================================================================

/**
 * POST /api/ocr
 * Process a passport image and extract data
 */
export async function POST(request: NextRequest) {
  // Every call costs OpenAI money — signed-in users only.
  const auth = await requireApiUser(request);
  if (auth.response) return auth.response;

  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured');
      return NextResponse.json(
        { error: 'OCR service not configured' },
        { status: 503 }
      );
    }
    
    // Get image data from request
    const body = await request.json();
    const { image } = body;
    
    if (!image) {
      return NextResponse.json(
        { error: 'No image provided' },
        { status: 400 }
      );
    }
    
    // Validate image format
    if (!image.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'Invalid image format. Expected base64 data URL.' },
        { status: 400 }
      );
    }
    
    console.log('Processing OCR request...');
    
    // Call OpenAI Vision API with GPT-4.1 mini for better instruction following
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4.1-mini', // GPT-4.1 mini: better instruction following, 83% cheaper
      response_format: { type: 'json_object' }, // Force valid JSON output
      messages: [
        {
          role: 'system',
          content: OCR_SYSTEM_PROMPT
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: image,
                detail: 'high' // Use high detail for better OCR accuracy
              }
            },
            {
              type: 'text',
              text: 'Please extract all passport information from this image.'
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0 // Zero temperature for maximum consistency
    });
    
    // Parse the response
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response from OCR service');
    }
    
    // Extract JSON from response (handle potential markdown code blocks)
    let jsonContent = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonContent = jsonMatch[1].trim();
    }
    
    // Parse JSON
    let passportData: PassportData;
    try {
      passportData = JSON.parse(jsonContent);
    } catch (parseError) {
      // Deliberately not logging `content`: on a parse failure it still holds
      // whatever the model read off the passport.
      console.error(
        `Failed to parse OCR response (${content?.length ?? 0} chars)`,
      );
      throw new Error('Failed to parse OCR response');
    }

    // Log shape and confidence only — never the extracted values.
    const fieldsFound = Object.entries(passportData).filter(
      ([key, value]) => key !== 'confidence' && value != null && value !== '',
    ).length;
    console.log(
      `OCR extraction complete: ${fieldsFound} fields, confidence ${passportData.confidence ?? 'n/a'}`,
    );
    
    // Return extracted data
    return NextResponse.json(passportData);
    
  } catch (error) {
    console.error('OCR error:', error);
    
    // Handle specific error types
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 503 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please try again later.' },
          { status: 429 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'OCR processing failed' },
      { status: 500 }
    );
  }
}

// ============================================================================
// MOCK OCR FOR TESTING
// ============================================================================

/**
 * GET /api/ocr
 * Returns a mock passport data object for testing
 */
export async function GET() {
  const mockData: PassportData = {
    firstName: 'JOHN',
    middleName: 'WILLIAM',
    lastName: 'SMITH',
    passportNumber: 'AB1234567',
    nationality: 'United States',
    dateOfBirth: {
      day: '15',
      month: '03',
      year: '1985'
    },
    gender: 'M',
    dateOfIssue: {
      day: '20',
      month: '06',
      year: '2020'
    },
    dateOfExpiry: {
      day: '19',
      month: '06',
      year: '2030'
    },
    placeOfBirth: 'NEW YORK',
    issuingAuthority: 'United States',
    passportType: 'passport',
    confidence: 0.95
  };
  
  return NextResponse.json({
    message: 'This is a mock OCR response for testing',
    data: mockData
  });
}

