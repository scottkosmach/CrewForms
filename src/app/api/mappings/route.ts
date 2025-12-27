/**
 * Field Mappings API
 * 
 * Manages form field mappings for supported websites.
 * Mappings define how passport data maps to form inputs on target sites.
 */

import { NextRequest, NextResponse } from 'next/server';

// ============================================================================
// TYPES
// ============================================================================

interface FieldConfig {
  keypressMap?: Record<string, { key: string; count: number }>;
  format?: string;
}

interface FieldMapping {
  position: number;
  dataSource: string;
  inputType: 'text' | 'select-match' | 'select-keypress' | 'date-text' | 'date-dropdowns' | 'date-picker' | 'radio' | 'checkbox';
  config?: FieldConfig;
}

interface SiteMapping {
  id: string;
  name: string;
  urlPattern: string;
  formType: 'static' | 'dynamic-guest-blocks';
  fields: FieldMapping[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

// In production, use a database (Supabase, etc.)
const mappings = new Map<string, SiteMapping>();

// Initialize with some example mappings
initializeExampleMappings();

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializeExampleMappings() {
  // Example mapping for a fictional port authority site
  const exampleMapping: SiteMapping = {
    id: 'example-port-authority',
    name: 'Example Port Authority',
    urlPattern: 'https://portauthority.example.gov/*',
    formType: 'dynamic-guest-blocks',
    fields: [
      { position: 1, dataSource: 'traveler.firstName', inputType: 'text' },
      { position: 2, dataSource: 'traveler.middleName', inputType: 'text' },
      { position: 3, dataSource: 'traveler.lastName', inputType: 'text' },
      { position: 4, dataSource: 'traveler.passportNumber', inputType: 'text' },
      { position: 5, dataSource: 'traveler.dateOfBirth.month', inputType: 'select-match' },
      { position: 6, dataSource: 'traveler.dateOfBirth.day', inputType: 'select-match' },
      { position: 7, dataSource: 'traveler.dateOfBirth.year', inputType: 'select-match' },
      { position: 8, dataSource: 'traveler.gender', inputType: 'radio' },
      { 
        position: 9, 
        dataSource: 'traveler.nationality', 
        inputType: 'select-keypress',
        config: {
          keypressMap: {
            'United States': { key: 'U', count: 4 },
            'United Kingdom': { key: 'U', count: 5 },
            'Canada': { key: 'C', count: 2 },
            'Australia': { key: 'A', count: 2 }
          }
        }
      },
      { 
        position: 10, 
        dataSource: 'traveler.dateOfExpiry', 
        inputType: 'date-text',
        config: { format: 'MM/DD/YYYY' }
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1
  };
  
  mappings.set(exampleMapping.id, exampleMapping);
  
  // Another example for boat information
  const boatMapping: SiteMapping = {
    id: 'example-boat-registry',
    name: 'Example Boat Registry',
    urlPattern: 'https://boats.example.gov/*',
    formType: 'static',
    fields: [
      { position: 1, dataSource: 'boat.vesselName', inputType: 'text' },
      { position: 2, dataSource: 'boat.registrationNumber', inputType: 'text' },
      { position: 3, dataSource: 'boat.flagState', inputType: 'select-match' },
      { position: 4, dataSource: 'boat.homePort', inputType: 'text' },
      { position: 5, dataSource: 'boat.vesselType', inputType: 'select-match' },
      { position: 6, dataSource: 'boat.capacity', inputType: 'text' },
      { position: 7, dataSource: 'captain.firstName', inputType: 'text' },
      { position: 8, dataSource: 'captain.lastName', inputType: 'text' },
      { position: 9, dataSource: 'captain.licenseNumber', inputType: 'text' }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    version: 1
  };
  
  mappings.set(boatMapping.id, boatMapping);
}

// ============================================================================
// API HANDLERS
// ============================================================================

/**
 * GET /api/mappings
 * Get a mapping by URL or list all mappings
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const id = searchParams.get('id');
  
  // Get specific mapping by ID
  if (id) {
    const mapping = mappings.get(id);
    if (!mapping) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(mapping);
  }
  
  // Find mapping by URL pattern
  if (url) {
    const mapping = findMappingForUrl(url);
    if (!mapping) {
      return NextResponse.json(
        { error: 'No mapping found for this URL' },
        { status: 404 }
      );
    }
    return NextResponse.json(mapping);
  }
  
  // List all mappings
  const allMappings = Array.from(mappings.values()).map(m => ({
    id: m.id,
    name: m.name,
    urlPattern: m.urlPattern,
    formType: m.formType,
    fieldCount: m.fields.length,
    version: m.version,
    updatedAt: m.updatedAt
  }));
  
  return NextResponse.json({ mappings: allMappings });
}

/**
 * POST /api/mappings
 * Create a new mapping
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.name || !body.urlPattern || !body.fields) {
      return NextResponse.json(
        { error: 'Missing required fields: name, urlPattern, fields' },
        { status: 400 }
      );
    }
    
    // Generate ID from URL pattern
    const id = body.id || generateMappingId(body.urlPattern);
    
    // Check for duplicate
    if (mappings.has(id)) {
      return NextResponse.json(
        { error: 'A mapping with this ID already exists' },
        { status: 409 }
      );
    }
    
    const mapping: SiteMapping = {
      id,
      name: body.name,
      urlPattern: body.urlPattern,
      formType: body.formType || 'static',
      fields: body.fields,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };
    
    mappings.set(id, mapping);
    
    console.log(`Created mapping: ${mapping.name} (${mapping.id})`);
    
    return NextResponse.json(mapping, { status: 201 });
    
  } catch (error) {
    console.error('Failed to create mapping:', error);
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/mappings
 * Update an existing mapping
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    
    if (!body.id) {
      return NextResponse.json(
        { error: 'Missing mapping ID' },
        { status: 400 }
      );
    }
    
    const existing = mappings.get(body.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Mapping not found' },
        { status: 404 }
      );
    }
    
    const updated: SiteMapping = {
      ...existing,
      name: body.name || existing.name,
      urlPattern: body.urlPattern || existing.urlPattern,
      formType: body.formType || existing.formType,
      fields: body.fields || existing.fields,
      updatedAt: Date.now(),
      version: existing.version + 1
    };
    
    mappings.set(body.id, updated);
    
    console.log(`Updated mapping: ${updated.name} (v${updated.version})`);
    
    return NextResponse.json(updated);
    
  } catch (error) {
    console.error('Failed to update mapping:', error);
    return NextResponse.json(
      { error: 'Failed to update mapping' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mappings
 * Delete a mapping
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  
  if (!id) {
    return NextResponse.json(
      { error: 'Missing mapping ID' },
      { status: 400 }
    );
  }
  
  if (!mappings.has(id)) {
    return NextResponse.json(
      { error: 'Mapping not found' },
      { status: 404 }
    );
  }
  
  mappings.delete(id);
  
  console.log(`Deleted mapping: ${id}`);
  
  return NextResponse.json({ success: true });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find a mapping that matches the given URL
 */
function findMappingForUrl(url: string): SiteMapping | null {
  for (const mapping of mappings.values()) {
    if (urlMatchesPattern(url, mapping.urlPattern)) {
      return mapping;
    }
  }
  return null;
}

/**
 * Check if a URL matches a pattern (supports * wildcards)
 */
function urlMatchesPattern(url: string, pattern: string): boolean {
  // Convert pattern to regex
  // Escape special regex chars except *
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

/**
 * Generate a mapping ID from URL pattern
 */
function generateMappingId(urlPattern: string): string {
  return urlPattern
    .replace(/https?:\/\//, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

// ============================================================================
// EXPORT HELPERS FOR TESTING
// ============================================================================

export { findMappingForUrl, urlMatchesPattern };

