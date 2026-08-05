/**
 * Excel Generate API
 * 
 * Generates a filled Excel file from a template and provided data.
 * Uses ExcelJS to read the blank template and fill in values based on
 * the template's column mappings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getValue,
  formatDate,
  applyValueMap,
  colLetterToNumber,
} from '@/lib/excel/values';
import ExcelJS from 'exceljs';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Column mapping for a cell in the Excel sheet
 */
interface ColumnMapping {
  col: string;           // Column letter (e.g., 'C', 'D')
  row?: number;          // Fixed row for 'single' dataType
  source: string;        // Data source path (e.g., 'traveler.lastName')
  required?: boolean;    // Whether the field is required
  format?: string;       // Date format (e.g., 'YYYY-MM-DD')
  valueMap?: Record<string, string>;  // Value transformations
}

/**
 * Sheet configuration within a template
 */
interface SheetConfig {
  sheetName: string;
  startRow: number;
  dataType: 'travelers' | 'crew' | 'single';
  columns: ColumnMapping[];
}

/**
 * Template from database
 */
interface ExcelTemplate {
  id: string;
  name: string;
  url_pattern: string;
  template_path: string;
  sheets: SheetConfig[];
}

/**
 * Traveler/passenger data structure
 */
interface TravelerData {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: string;
  passportIssueDate?: string;
  passportIssueCountry?: string;
  placeOfBirth?: string;
  [key: string]: string | undefined;
}

/**
 * Captain/crew data (same structure as traveler)
 */
type CaptainData = TravelerData;
type CrewMemberData = TravelerData;

/**
 * Boat/vessel data structure
 */
interface BoatData {
  vesselName?: string;
  flagState?: string;
  registrationNumber?: string;
  callSign?: string;
  grossTonnage?: string;
  [key: string]: string | undefined;
}

/**
 * Trip data structure
 */
interface TripData {
  departurePort?: string;
  departureDate?: string;
  arrivalPort?: string;
  arrivalDate?: string;
  purpose?: string;
  [key: string]: string | undefined;
}

/**
 * Request body for generate endpoint
 */
interface GenerateRequest {
  templateId: string;
  travelers?: TravelerData[];
  captain?: CaptainData;
  crew?: CrewMemberData[];
  boat?: BoatData;
  trip?: TripData;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================









/**
 * Fill a single cell with data
 */
function fillCell(
  worksheet: ExcelJS.Worksheet,
  row: number,
  col: string,
  value: string | undefined,
  mapping: ColumnMapping
): void {
  // Skip if no value and not required
  if (!value && !mapping.required) {
    return;
  }
  
  // Apply date formatting if specified
  let finalValue = value || '';
  if (mapping.format && value) {
    finalValue = formatDate(value, mapping.format);
  }
  
  // Apply value mapping
  finalValue = applyValueMap(finalValue, mapping.valueMap);
  
  // Get cell and set value
  const cell = worksheet.getCell(row, colLetterToNumber(col));
  cell.value = finalValue;
}

/**
 * Fill a sheet with traveler list data (one row per traveler)
 */
function fillTravelerSheet(
  worksheet: ExcelJS.Worksheet,
  sheetConfig: SheetConfig,
  travelers: TravelerData[]
): void {
  travelers.forEach((traveler, index) => {
    const rowNum = sheetConfig.startRow + index;
    
    // Create a data context with the traveler object
    const dataContext = { traveler };
    
    // Fill each column for this traveler
    sheetConfig.columns.forEach(mapping => {
      const value = getValue(dataContext, mapping.source);
      fillCell(worksheet, rowNum, mapping.col, value, mapping);
    });
  });
}

/**
 * Fill a sheet with crew data (captain first, then crew members)
 */
function fillCrewSheet(
  worksheet: ExcelJS.Worksheet,
  sheetConfig: SheetConfig,
  captain: CaptainData | undefined,
  crew: CrewMemberData[]
): void {
  // Combine captain and crew into a single list
  const allCrew: CrewMemberData[] = [];
  
  if (captain) {
    allCrew.push(captain);
  }
  
  allCrew.push(...crew);
  
  // Fill rows
  allCrew.forEach((member, index) => {
    const rowNum = sheetConfig.startRow + index;
    
    // Create a data context
    const dataContext = { 
      crew: member,
      // Also expose as 'captain' if it's the first row and we have a captain
      captain: index === 0 && captain ? member : undefined
    };
    
    // Fill each column
    sheetConfig.columns.forEach(mapping => {
      const value = getValue(dataContext, mapping.source);
      fillCell(worksheet, rowNum, mapping.col, value, mapping);
    });
  });
}

/**
 * Fill a sheet with single (non-repeating) data
 */
function fillSingleSheet(
  worksheet: ExcelJS.Worksheet,
  sheetConfig: SheetConfig,
  data: GenerateRequest
): void {
  // Create a full data context
  const dataContext = {
    captain: data.captain,
    boat: data.boat,
    trip: data.trip
  };
  
  // Fill each mapping (each has a specific row)
  sheetConfig.columns.forEach(mapping => {
    // For 'single' type, row is specified in the mapping
    const rowNum = mapping.row || sheetConfig.startRow;
    const value = getValue(dataContext, mapping.source);
    fillCell(worksheet, rowNum, mapping.col, value, mapping);
  });
}

// ============================================================================
// API HANDLER
// ============================================================================

/**
 * POST /api/excel/generate
 * Generate a filled Excel file
 * 
 * Request body:
 * - templateId: ID of the Excel template to use
 * - travelers: Array of traveler data
 * - captain: Captain data object
 * - crew: Array of crew member data
 * - boat: Boat/vessel data
 * - trip: Trip data
 * 
 * Response: Excel file download
 */
export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    
    // Validate required fields
    if (!body.templateId) {
      return NextResponse.json(
        { error: 'Missing required field: templateId' },
        { status: 400 }
      );
    }
    
    const supabase = createAdminClient();
    
    // 1. Load template configuration from database
    const { data: template, error: templateError } = await supabase
      .from('excel_templates')
      .select('*')
      .eq('id', body.templateId)
      .single();
    
    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    const typedTemplate = template as ExcelTemplate;
    
    // 2. Download blank template file from Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('templates')
      .download(typedTemplate.template_path);
    
    if (downloadError || !fileData) {
      console.error('Failed to download template file:', downloadError);
      return NextResponse.json(
        { error: 'Failed to download template file' },
        { status: 500 }
      );
    }
    
    // 3. Load workbook with ExcelJS
    const workbook = new ExcelJS.Workbook();
    const arrayBuffer = await fileData.arrayBuffer();
    await workbook.xlsx.load(arrayBuffer);
    
    // 4. Process each sheet configuration
    for (const sheetConfig of typedTemplate.sheets) {
      // Find the worksheet by name
      const worksheet = workbook.getWorksheet(sheetConfig.sheetName);
      
      if (!worksheet) {
        console.warn(`Worksheet not found: ${sheetConfig.sheetName}`);
        continue;
      }
      
      // Fill based on data type
      switch (sheetConfig.dataType) {
        case 'travelers':
          fillTravelerSheet(worksheet, sheetConfig, body.travelers || []);
          break;
          
        case 'crew':
          fillCrewSheet(worksheet, sheetConfig, body.captain, body.crew || []);
          break;
          
        case 'single':
          fillSingleSheet(worksheet, sheetConfig, body);
          break;
          
        default:
          console.warn(`Unknown dataType: ${sheetConfig.dataType}`);
      }
    }
    
    // 5. Generate output buffer
    const outputBuffer = await workbook.xlsx.writeBuffer();
    
    // 6. Create filename for download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${typedTemplate.name.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}.xlsx`;
    
    // 7. Return the filled Excel file
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': outputBuffer.byteLength.toString()
      }
    });
    
  } catch (error) {
    console.error('POST /api/excel/generate error:', error);
    return NextResponse.json(
      { error: 'Failed to generate Excel file' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/excel/generate
 * Check if a template exists for a given URL
 * 
 * Query params:
 * - url: URL to check for matching template
 * 
 * Response: { hasTemplate: boolean, templateId?: string, templateName?: string }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }
  
  try {
    const supabase = createAdminClient();
    
    // Fetch all templates
    const { data: templates, error } = await supabase
      .from('excel_templates')
      .select('id, name, url_pattern');
    
    if (error) {
      console.error('Failed to fetch templates:', error);
      return NextResponse.json(
        { error: 'Failed to check templates' },
        { status: 500 }
      );
    }
    
    // Find matching template
    const matchingTemplate = templates?.find(t => {
      const pattern = t.url_pattern
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`, 'i');
      return regex.test(url);
    });
    
    if (!matchingTemplate) {
      return NextResponse.json({ hasTemplate: false });
    }
    
    return NextResponse.json({
      hasTemplate: true,
      templateId: matchingTemplate.id,
      templateName: matchingTemplate.name
    });
    
  } catch (error) {
    console.error('GET /api/excel/generate error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

