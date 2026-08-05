/**
 * Excel Template Editor Page
 * 
 * Create or edit Excel template configurations.
 * Handles file upload, sheet detection, and column mapping.
 */

'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

interface ColumnMapping {
  col: string;
  row?: number;
  source: string;
  required?: boolean;
  format?: string;
  valueMap?: Record<string, string>;
}

interface SheetConfig {
  sheetName: string;
  startRow: number;
  dataType: 'travelers' | 'crew' | 'single';
  columns: ColumnMapping[];
  enabled: boolean;  // UI-only: whether this sheet is used
}

interface ExcelTemplate {
  id: string;
  name: string;
  urlPattern: string;
  description: string | null;
  templatePath: string;
  sheets: SheetConfig[];
  createdAt: number;
  updatedAt: number;
  version: number;
}

interface DataSourceOption {
  value: string;
  label: string;
}

// ============================================================================
// DATA SOURCES (matching extension's DATA_SOURCES)
// ============================================================================

const DATA_SOURCES: Record<string, DataSourceOption[]> = {
  traveler: [
    { value: 'traveler.firstName', label: 'First Name' },
    { value: 'traveler.middleName', label: 'Middle Name' },
    { value: 'traveler.lastName', label: 'Last Name' },
    { value: 'traveler.passportNumber', label: 'Passport Number' },
    { value: 'traveler.nationality', label: 'Nationality' },
    { value: 'traveler.gender', label: 'Gender' },
    { value: 'traveler.placeOfBirth', label: 'Place of Birth' },
    { value: 'traveler.dateOfBirth', label: 'Date of Birth' },
    { value: 'traveler.dateOfIssue', label: 'Issue Date' },
    { value: 'traveler.dateOfExpiry', label: 'Expiry Date' },
    { value: 'traveler.issuingAuthority', label: 'Issuing Authority' },
    { value: 'traveler.passportType', label: 'Passport Type' }
  ],
  captain: [
    { value: 'captain.firstName', label: 'First Name' },
    { value: 'captain.middleName', label: 'Middle Name' },
    { value: 'captain.lastName', label: 'Last Name' },
    { value: 'captain.passportNumber', label: 'Passport Number' },
    { value: 'captain.nationality', label: 'Nationality' },
    { value: 'captain.licenseNumber', label: 'License Number' },
    { value: 'captain.email', label: 'Email' },
    { value: 'captain.phone', label: 'Phone' },
    { value: 'captain.dateOfBirth', label: 'Date of Birth' },
    { value: 'captain.passportExpiry', label: 'Passport Expiry' }
  ],
  crew: [
    { value: 'crew.firstName', label: 'First Name' },
    { value: 'crew.middleName', label: 'Middle Name' },
    { value: 'crew.lastName', label: 'Last Name' },
    { value: 'crew.passportNumber', label: 'Passport Number' },
    { value: 'crew.nationality', label: 'Nationality' },
    { value: 'crew.dateOfBirth', label: 'Date of Birth' }
  ],
  boat: [
    { value: 'boat.vesselName', label: 'Vessel Name' },
    { value: 'boat.registrationNumber', label: 'Registration Number' },
    { value: 'boat.flagState', label: 'Flag State' },
    { value: 'boat.homePort', label: 'Home Port' },
    { value: 'boat.vesselType', label: 'Vessel Type' },
    { value: 'boat.capacity', label: 'Capacity' }
  ],
  trip: [
    { value: 'trip.departurePort', label: 'Departure Port' },
    { value: 'trip.destinationPorts', label: 'Destination Ports' },
    { value: 'trip.purpose', label: 'Purpose' },
    { value: 'trip.guestCount', label: 'Guest Count' },
    { value: 'trip.departureDate', label: 'Departure Date' },
    { value: 'trip.returnDate', label: 'Return Date' }
  ]
};

const DATE_FORMATS = [
  { value: '', label: 'No formatting' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY' }
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function ExcelTemplateEditor({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const isNew = resolvedParams.id === 'new';
  
  // Form state
  const [name, setName] = useState('');
  const [urlPattern, setUrlPattern] = useState('');
  const [description, setDescription] = useState('');
  const [templatePath, setTemplatePath] = useState('');
  const [sheets, setSheets] = useState<SheetConfig[]>([]);
  const [originalFileName, setOriginalFileName] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  
  // Load existing template
  useEffect(() => {
    if (!isNew) {
      loadTemplate();
    }
  }, [isNew, resolvedParams.id]);
  
  /**
   * Load template from API
   */
  async function loadTemplate() {
    try {
      setLoading(true);
      const response = await fetch(`/api/excel-templates/${resolvedParams.id}`);
      
      if (!response.ok) {
        throw new Error('Template not found');
      }
      
      const data: ExcelTemplate = await response.json();
      setName(data.name);
      setUrlPattern(data.urlPattern);
      setDescription(data.description || '');
      setTemplatePath(data.templatePath);
      setOriginalFileName(data.templatePath.split('-').slice(1).join('-') || data.templatePath);
      
      // Add 'enabled' flag to sheets for UI
      setSheets(data.sheets.map(s => ({ ...s, enabled: true })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load template');
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Handle file upload
   */
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file type
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }
    
    try {
      setUploading(true);
      setError(null);
      
      // Upload file
      const formData = new FormData();
      formData.append('file', file);
      
      const uploadResponse = await fetch('/api/excel-templates/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!uploadResponse.ok) {
        const data = await uploadResponse.json();
        throw new Error(data.error || 'Upload failed');
      }
      
      const uploadData = await uploadResponse.json();
      setTemplatePath(uploadData.path);
      setOriginalFileName(file.name);
      
      // TODO: In a future enhancement, we could read sheet names from the file
      // For now, user will manually add sheet configurations
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }
  
  /**
   * Add a new sheet configuration
   */
  const addSheet = useCallback(() => {
    const newSheet: SheetConfig = {
      sheetName: `Sheet${sheets.length + 1}`,
      startRow: 1,
      dataType: 'travelers',
      columns: [],
      enabled: true
    };
    setSheets([...sheets, newSheet]);
    setActiveSheet(sheets.length);
  }, [sheets]);
  
  /**
   * Remove a sheet configuration
   */
  const removeSheet = useCallback((index: number) => {
    if (!confirm('Remove this sheet configuration?')) return;
    const newSheets = sheets.filter((_, i) => i !== index);
    setSheets(newSheets);
    if (activeSheet >= newSheets.length) {
      setActiveSheet(Math.max(0, newSheets.length - 1));
    }
  }, [sheets, activeSheet]);
  
  /**
   * Update sheet property
   */
  const updateSheet = useCallback((index: number, updates: Partial<SheetConfig>) => {
    setSheets(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  }, []);
  
  /**
   * Add column mapping to a sheet
   */
  const addColumn = useCallback((sheetIndex: number) => {
    const newColumn: ColumnMapping = {
      col: 'A',
      source: 'traveler.lastName',
      required: false
    };
    setSheets(prev => prev.map((s, i) => 
      i === sheetIndex 
        ? { ...s, columns: [...s.columns, newColumn] }
        : s
    ));
  }, []);
  
  /**
   * Update column mapping
   */
  const updateColumn = useCallback((sheetIndex: number, colIndex: number, updates: Partial<ColumnMapping>) => {
    setSheets(prev => prev.map((s, i) => 
      i === sheetIndex 
        ? { 
            ...s, 
            columns: s.columns.map((c, ci) => ci === colIndex ? { ...c, ...updates } : c)
          }
        : s
    ));
  }, []);
  
  /**
   * Remove column mapping
   */
  const removeColumn = useCallback((sheetIndex: number, colIndex: number) => {
    setSheets(prev => prev.map((s, i) => 
      i === sheetIndex 
        ? { ...s, columns: s.columns.filter((_, ci) => ci !== colIndex) }
        : s
    ));
  }, []);
  
  /**
   * Save template
   */
  async function handleSave() {
    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!urlPattern.trim()) {
      setError('URL pattern is required');
      return;
    }
    if (!templatePath) {
      setError('Please upload a template file');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      // Prepare sheet data (remove UI-only 'enabled' flag for disabled sheets)
      const enabledSheets = sheets
        .filter(s => s.enabled)
        .map(({ enabled, ...rest }) => rest);
      
      const payload = {
        id: isNew ? undefined : resolvedParams.id,
        name: name.trim(),
        urlPattern: urlPattern.trim(),
        description: description.trim() || null,
        templatePath,
        sheets: enabledSheets
      };
      
      const response = await fetch(
        isNew ? '/api/excel-templates' : `/api/excel-templates/${resolvedParams.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      router.push('/admin/excel-templates');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  if (loading) {
    return (
      <div className="loading-page">
        <style jsx>{`
          .loading-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8fafc;
            color: #64748b;
          }
        `}</style>
        Loading template...
      </div>
    );
  }
  
  const currentSheet = sheets[activeSheet];
  
  return (
    <div className="editor-page">
      <style jsx>{`
        .editor-page {
          min-height: 100vh;
          background: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .header {
          background: linear-gradient(135deg, #065f46 0%, #064e3b 100%);
          color: white;
          padding: 20px 0;
        }
        
        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 20px;
          font-weight: 600;
        }
        
        .logo svg {
          width: 28px;
          height: 28px;
        }
        
        .header-actions {
          display: flex;
          gap: 12px;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 30px 20px;
        }
        
        .page-header {
          margin-bottom: 24px;
        }
        
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 8px;
        }
        
        .page-subtitle {
          color: #64748b;
          font-size: 14px;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        
        .btn-primary {
          background: #059669;
          color: white;
        }
        
        .btn-primary:hover:not(:disabled) {
          background: #047857;
        }
        
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .btn-secondary {
          background: #e2e8f0;
          color: #475569;
        }
        
        .btn-secondary:hover {
          background: #cbd5e1;
        }
        
        .btn-outline {
          background: transparent;
          border: 1px solid #d1d5db;
          color: #374151;
        }
        
        .btn-outline:hover {
          background: #f3f4f6;
        }
        
        .btn-danger {
          background: #fee2e2;
          color: #dc2626;
        }
        
        .btn-danger:hover {
          background: #fecaca;
        }
        
        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
        }
        
        .btn-ghost {
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .btn-ghost:hover {
          background: rgba(255, 255, 255, 0.25);
        }
        
        .error-banner {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
        }
        
        .card-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 600;
          color: #1e293b;
        }
        
        .card-body {
          padding: 20px;
        }
        
        .form-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }
        
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        
        .form-group.full-width {
          grid-column: 1 / -1;
        }
        
        .form-label {
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }
        
        .form-label .hint {
          font-weight: 400;
          color: #9ca3af;
          margin-left: 4px;
        }
        
        .form-input {
          padding: 10px 14px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s ease;
        }
        
        .form-input:focus {
          outline: none;
          border-color: #059669;
          box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.1);
        }
        
        .file-upload {
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          padding: 24px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .file-upload:hover {
          border-color: #059669;
          background: #f0fdf4;
        }
        
        .file-upload.has-file {
          border-style: solid;
          border-color: #059669;
          background: #f0fdf4;
        }
        
        .file-upload input {
          display: none;
        }
        
        .file-upload svg {
          width: 32px;
          height: 32px;
          color: #9ca3af;
          margin-bottom: 8px;
        }
        
        .file-upload.has-file svg {
          color: #059669;
        }
        
        .file-upload p {
          color: #64748b;
          font-size: 14px;
        }
        
        .file-upload .filename {
          color: #059669;
          font-weight: 500;
        }
        
        .sheet-tabs {
          display: flex;
          gap: 8px;
          padding: 0 20px;
          border-bottom: 1px solid #e2e8f0;
          overflow-x: auto;
        }
        
        .sheet-tab {
          padding: 12px 16px;
          font-size: 14px;
          font-weight: 500;
          color: #64748b;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        
        .sheet-tab:hover {
          color: #1e293b;
        }
        
        .sheet-tab.active {
          color: #059669;
          border-bottom-color: #059669;
        }
        
        .sheet-tab-add {
          padding: 12px 16px;
          font-size: 14px;
          color: #059669;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .sheet-tab-add:hover {
          background: #f0fdf4;
        }
        
        .sheet-config {
          padding: 20px;
        }
        
        .sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        
        .columns-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        
        .columns-table th,
        .columns-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .columns-table th {
          background: #f8fafc;
          font-weight: 500;
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
        }
        
        .columns-table input,
        .columns-table select {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 13px;
        }
        
        .columns-table input:focus,
        .columns-table select:focus {
          outline: none;
          border-color: #059669;
        }
        
        .col-input {
          width: 60px !important;
          text-transform: uppercase;
        }
        
        .row-input {
          width: 70px !important;
        }
        
        .checkbox-cell {
          text-align: center !important;
          width: 80px;
        }
        
        .checkbox-cell input {
          width: auto !important;
        }
        
        .action-cell {
          width: 60px;
          text-align: center !important;
        }
        
        .empty-columns {
          padding: 40px 20px;
          text-align: center;
          color: #64748b;
        }
      `}</style>
      
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            {isNew ? 'New Template' : 'Edit Template'}
          </div>
          <div className="header-actions">
            <Link href="/admin/excel-templates" className="btn btn-ghost">
              Cancel
            </Link>
            <button 
              onClick={handleSave} 
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container">
        <div className="page-header">
          <h1 className="page-title">
            {isNew ? 'Create Excel Template' : `Edit: ${name}`}
          </h1>
          <p className="page-subtitle">
            Configure how Excel spreadsheets are filled from passport data
          </p>
        </div>
        
        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}
        
        {/* Basic Info */}
        <div className="card">
          <div className="card-header">Basic Information</div>
          <div className="card-body">
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Template Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., CBP I-418 Template"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  URL Pattern
                  <span className="hint">(use * for wildcards)</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={urlPattern}
                  onChange={e => setUrlPattern(e.target.value)}
                  placeholder="e.g., https://cbp.gov/*"
                />
              </div>
              <div className="form-group full-width">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
          </div>
        </div>
        
        {/* File Upload */}
        <div className="card">
          <div className="card-header">Template File</div>
          <div className="card-body">
            <label className={`file-upload ${templatePath ? 'has-file' : ''}`}>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
              </svg>
              {uploading ? (
                <p>Uploading...</p>
              ) : templatePath ? (
                <p className="filename">{originalFileName}</p>
              ) : (
                <p>Click to upload a blank Excel template (.xlsx)</p>
              )}
            </label>
          </div>
        </div>
        
        {/* Sheet Configuration */}
        <div className="card">
          <div className="sheet-tabs">
            {sheets.map((sheet, index) => (
              <div
                key={index}
                className={`sheet-tab ${activeSheet === index ? 'active' : ''}`}
                onClick={() => setActiveSheet(index)}
              >
                {sheet.sheetName}
              </div>
            ))}
            <div className="sheet-tab-add" onClick={addSheet}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Sheet
            </div>
          </div>
          
          {sheets.length === 0 ? (
            <div className="empty-columns">
              <p>No sheets configured. Click &quot;Add Sheet&quot; to begin.</p>
            </div>
          ) : currentSheet && (
            <div className="sheet-config">
              <div className="sheet-header">
                <div className="form-grid" style={{ flex: 1, marginBottom: 0 }}>
                  <div className="form-group">
                    <label className="form-label">Sheet Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={currentSheet.sheetName}
                      onChange={e => updateSheet(activeSheet, { sheetName: e.target.value })}
                      placeholder="Sheet name in Excel"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Data Type</label>
                    <select
                      className="form-input"
                      value={currentSheet.dataType}
                      onChange={e => updateSheet(activeSheet, { dataType: e.target.value as SheetConfig['dataType'] })}
                    >
                      <option value="travelers">Travelers (one row per traveler)</option>
                      <option value="crew">Crew (captain + crew members)</option>
                      <option value="single">Single (fixed cells)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Row</label>
                    <input
                      type="number"
                      className="form-input"
                      value={currentSheet.startRow}
                      onChange={e => updateSheet(activeSheet, { startRow: parseInt(e.target.value) || 1 })}
                      min={1}
                    />
                  </div>
                </div>
                <button
                  onClick={() => removeSheet(activeSheet)}
                  className="btn btn-sm btn-danger"
                  style={{ marginLeft: 20 }}
                >
                  Remove Sheet
                </button>
              </div>
              
              {/* Column Mappings */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, color: '#374151' }}>Column Mappings</h4>
                  <button onClick={() => addColumn(activeSheet)} className="btn btn-sm btn-secondary">
                    + Add Column
                  </button>
                </div>
                
                {currentSheet.columns.length === 0 ? (
                  <div className="empty-columns">
                    <p>No columns configured. Click &quot;Add Column&quot; to map data to Excel columns.</p>
                  </div>
                ) : (
                  <table className="columns-table">
                    <thead>
                      <tr>
                        <th>Column</th>
                        {currentSheet.dataType === 'single' && <th>Row</th>}
                        <th>Data Source</th>
                        <th>Date Format</th>
                        <th className="checkbox-cell">Required</th>
                        <th className="action-cell">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentSheet.columns.map((col, colIndex) => (
                        <tr key={colIndex}>
                          <td>
                            <input
                              type="text"
                              className="col-input"
                              value={col.col}
                              onChange={e => updateColumn(activeSheet, colIndex, { col: e.target.value.toUpperCase() })}
                              placeholder="A"
                              maxLength={3}
                            />
                          </td>
                          {currentSheet.dataType === 'single' && (
                            <td>
                              <input
                                type="number"
                                className="row-input"
                                value={col.row || ''}
                                onChange={e => updateColumn(activeSheet, colIndex, { row: parseInt(e.target.value) || undefined })}
                                placeholder="Row"
                                min={1}
                              />
                            </td>
                          )}
                          <td>
                            <select
                              value={col.source}
                              onChange={e => updateColumn(activeSheet, colIndex, { source: e.target.value })}
                            >
                              {currentSheet.dataType === 'travelers' && (
                                <optgroup label="Traveler">
                                  {DATA_SOURCES.traveler.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </optgroup>
                              )}
                              {currentSheet.dataType === 'crew' && (
                                <>
                                  <optgroup label="Captain">
                                    {DATA_SOURCES.captain.map(s => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Crew Member">
                                    {DATA_SOURCES.crew.map(s => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </optgroup>
                                </>
                              )}
                              {currentSheet.dataType === 'single' && (
                                <>
                                  <optgroup label="Captain">
                                    {DATA_SOURCES.captain.map(s => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Boat">
                                    {DATA_SOURCES.boat.map(s => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="Trip">
                                    {DATA_SOURCES.trip.map(s => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </optgroup>
                                </>
                              )}
                            </select>
                          </td>
                          <td>
                            <select
                              value={col.format || ''}
                              onChange={e => updateColumn(activeSheet, colIndex, { format: e.target.value || undefined })}
                            >
                              {DATE_FORMATS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="checkbox-cell">
                            <input
                              type="checkbox"
                              checked={col.required || false}
                              onChange={e => updateColumn(activeSheet, colIndex, { required: e.target.checked })}
                            />
                          </td>
                          <td className="action-cell">
                            <button
                              onClick={() => removeColumn(activeSheet, colIndex)}
                              className="btn btn-sm btn-danger"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

