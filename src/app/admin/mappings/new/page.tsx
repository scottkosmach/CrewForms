/**
 * New Mapping Page
 * 
 * Form to create a new field mapping configuration.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

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
  inputType: string;
  config?: FieldConfig;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const INPUT_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'select-match', label: 'Select (Match Text)' },
  { value: 'select-keypress', label: 'Select (Keypress Navigation)' },
  { value: 'date-text', label: 'Date (Text Input)' },
  { value: 'date-dropdowns', label: 'Date (Separate Dropdowns)' },
  { value: 'date-picker', label: 'Date (Calendar Picker)' },
  { value: 'radio', label: 'Radio Button' },
  { value: 'checkbox', label: 'Checkbox' }
];

const DATA_SOURCES = [
  // Traveler fields
  { value: 'traveler.firstName', label: 'Traveler - First Name', group: 'Traveler' },
  { value: 'traveler.middleName', label: 'Traveler - Middle Name', group: 'Traveler' },
  { value: 'traveler.lastName', label: 'Traveler - Last Name', group: 'Traveler' },
  { value: 'traveler.passportNumber', label: 'Traveler - Passport Number', group: 'Traveler' },
  { value: 'traveler.nationality', label: 'Traveler - Nationality', group: 'Traveler' },
  { value: 'traveler.gender', label: 'Traveler - Gender', group: 'Traveler' },
  { value: 'traveler.placeOfBirth', label: 'Traveler - Place of Birth', group: 'Traveler' },
  { value: 'traveler.dateOfBirth.day', label: 'Traveler - DOB Day', group: 'Traveler' },
  { value: 'traveler.dateOfBirth.month', label: 'Traveler - DOB Month', group: 'Traveler' },
  { value: 'traveler.dateOfBirth.year', label: 'Traveler - DOB Year', group: 'Traveler' },
  { value: 'traveler.dateOfExpiry.day', label: 'Traveler - Passport Exp. Day', group: 'Traveler' },
  { value: 'traveler.dateOfExpiry.month', label: 'Traveler - Passport Exp. Month', group: 'Traveler' },
  { value: 'traveler.dateOfExpiry.year', label: 'Traveler - Passport Exp. Year', group: 'Traveler' },
  // Captain fields
  { value: 'captain.firstName', label: 'Captain - First Name', group: 'Captain' },
  { value: 'captain.lastName', label: 'Captain - Last Name', group: 'Captain' },
  { value: 'captain.passportNumber', label: 'Captain - Passport Number', group: 'Captain' },
  { value: 'captain.nationality', label: 'Captain - Nationality', group: 'Captain' },
  { value: 'captain.licenseNumber', label: 'Captain - License Number', group: 'Captain' },
  // Boat fields
  { value: 'boat.vesselName', label: 'Boat - Vessel Name', group: 'Boat' },
  { value: 'boat.registrationNumber', label: 'Boat - Registration Number', group: 'Boat' },
  { value: 'boat.flagState', label: 'Boat - Flag State', group: 'Boat' },
  { value: 'boat.homePort', label: 'Boat - Home Port', group: 'Boat' },
  { value: 'boat.vesselType', label: 'Boat - Vessel Type', group: 'Boat' },
  { value: 'boat.capacity', label: 'Boat - Capacity', group: 'Boat' },
  // Company fields
  { value: 'company.companyName', label: 'Company - Name', group: 'Company' },
  { value: 'company.registrationNumber', label: 'Company - Registration Number', group: 'Company' },
  // Trip fields
  { value: 'trip.departurePort', label: 'Trip - Departure Port', group: 'Trip' },
  { value: 'trip.destinationPorts', label: 'Trip - Destination Ports', group: 'Trip' },
  { value: 'trip.purpose', label: 'Trip - Purpose', group: 'Trip' }
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function NewMappingPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [urlPattern, setUrlPattern] = useState('');
  const [formType, setFormType] = useState('static');
  const [fields, setFields] = useState<FieldMapping[]>([
    { position: 1, dataSource: '', inputType: 'text' }
  ]);
  
  /**
   * Add a new field to the mapping
   */
  function addField() {
    const nextPosition = fields.length > 0 
      ? Math.max(...fields.map(f => f.position)) + 1 
      : 1;
    
    setFields([...fields, { 
      position: nextPosition, 
      dataSource: '', 
      inputType: 'text' 
    }]);
  }
  
  /**
   * Remove a field from the mapping
   */
  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }
  
  /**
   * Update a field's property
   */
  function updateField(index: number, key: keyof FieldMapping, value: unknown) {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    setFields(updated);
  }
  
  /**
   * Submit the form
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!urlPattern.trim()) {
      setError('URL pattern is required');
      return;
    }
    if (fields.length === 0) {
      setError('At least one field mapping is required');
      return;
    }
    
    // Filter out empty fields
    const validFields = fields.filter(f => f.dataSource);
    
    if (validFields.length === 0) {
      setError('At least one field must have a data source');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      const response = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          urlPattern,
          formType,
          fields: validFields
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create mapping');
      }
      
      // Redirect to admin dashboard
      router.push('/admin');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="admin-page">
      <style jsx>{`
        .admin-page {
          min-height: 100vh;
          background: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .header {
          background: linear-gradient(135deg, #1e3a5f 0%, #0f1f33 100%);
          color: white;
          padding: 20px 0;
        }
        
        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          display: flex;
          align-items: center;
          gap: 20px;
        }
        
        .back-link {
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .back-link:hover {
          color: white;
        }
        
        .header-title {
          font-size: 20px;
          font-weight: 600;
        }
        
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 30px 20px;
        }
        
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 24px;
          margin-bottom: 20px;
        }
        
        .card-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 20px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          margin-bottom: 6px;
        }
        
        .form-input,
        .form-select {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s ease;
        }
        
        .form-input:focus,
        .form-select:focus {
          outline: none;
          border-color: #0891b2;
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.1);
        }
        
        .form-hint {
          font-size: 13px;
          color: #6b7280;
          margin-top: 4px;
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        
        .field-row {
          display: grid;
          grid-template-columns: 80px 1fr 1fr auto;
          gap: 12px;
          align-items: end;
          padding: 16px;
          background: #f8fafc;
          border-radius: 8px;
          margin-bottom: 12px;
        }
        
        .field-row .form-group {
          margin-bottom: 0;
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
          transition: all 0.2s ease;
        }
        
        .btn-primary {
          background: #0891b2;
          color: white;
        }
        
        .btn-primary:hover {
          background: #0e7490;
        }
        
        .btn-primary:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }
        
        .btn-secondary {
          background: #e2e8f0;
          color: #475569;
        }
        
        .btn-secondary:hover {
          background: #cbd5e1;
        }
        
        .btn-danger {
          background: #fee2e2;
          color: #dc2626;
          padding: 8px 12px;
        }
        
        .btn-danger:hover {
          background: #fecaca;
        }
        
        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
        }
        
        .error-banner {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          padding-top: 20px;
          border-top: 1px solid #e2e8f0;
        }
        
        .add-field-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 12px;
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          background: transparent;
          color: #6b7280;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .add-field-btn:hover {
          border-color: #0891b2;
          color: #0891b2;
        }
      `}</style>
      
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <Link href="/admin" className="back-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
            Back
          </Link>
          <h1 className="header-title">New Field Mapping</h1>
        </div>
      </header>
      
      {/* Form */}
      <main className="container">
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="error-banner">{error}</div>
          )}
          
          {/* Basic Info */}
          <div className="card">
            <h2 className="card-title">Basic Information</h2>
            
            <div className="form-group">
              <label className="form-label">Mapping Name</label>
              <input
                type="text"
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Port Authority Guest Form"
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">URL Pattern</label>
              <input
                type="text"
                className="form-input"
                value={urlPattern}
                onChange={e => setUrlPattern(e.target.value)}
                placeholder="e.g., https://portauthority.example.gov/*"
              />
              <p className="form-hint">Use * as a wildcard. Example: https://site.com/forms/*</p>
            </div>
            
            <div className="form-group">
              <label className="form-label">Form Type</label>
              <select
                className="form-select"
                value={formType}
                onChange={e => setFormType(e.target.value)}
              >
                <option value="static">Static (Single form)</option>
                <option value="dynamic-guest-blocks">Dynamic (Repeating guest blocks)</option>
              </select>
              <p className="form-hint">
                Dynamic forms have repeatable sections for multiple guests
              </p>
            </div>
          </div>
          
          {/* Field Mappings */}
          <div className="card">
            <h2 className="card-title">Field Mappings</h2>
            <p className="form-hint" style={{ marginBottom: '20px' }}>
              Map form field positions to data sources. Position 1 is the first input field.
            </p>
            
            {fields.map((field, index) => (
              <div key={index} className="field-row">
                <div className="form-group">
                  <label className="form-label">Position</label>
                  <input
                    type="number"
                    className="form-input"
                    value={field.position}
                    onChange={e => updateField(index, 'position', parseInt(e.target.value) || 1)}
                    min="1"
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Data Source</label>
                  <select
                    className="form-select"
                    value={field.dataSource}
                    onChange={e => updateField(index, 'dataSource', e.target.value)}
                  >
                    <option value="">-- Select --</option>
                    {['Traveler', 'Captain', 'Boat', 'Company', 'Trip'].map(group => (
                      <optgroup key={group} label={group}>
                        {DATA_SOURCES
                          .filter(ds => ds.group === group)
                          .map(ds => (
                            <option key={ds.value} value={ds.value}>
                              {ds.label}
                            </option>
                          ))
                        }
                      </optgroup>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Input Type</label>
                  <select
                    className="form-select"
                    value={field.inputType}
                    onChange={e => updateField(index, 'inputType', e.target.value)}
                  >
                    {INPUT_TYPES.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeField(index)}
                  title="Remove field"
                >
                  ×
                </button>
              </div>
            ))}
            
            <button
              type="button"
              className="add-field-btn"
              onClick={addField}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Field
            </button>
          </div>
          
          {/* Actions */}
          <div className="card">
            <div className="form-actions">
              <Link href="/admin" className="btn btn-secondary">
                Cancel
              </Link>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Create Mapping'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

