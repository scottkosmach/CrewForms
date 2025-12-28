/**
 * Mapping Details Page (Read-Only)
 * 
 * Full page view showing all configuration details for a single mapping.
 * Displays all field properties including keypress mappings.
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

interface KeypressEntry {
  key: string;
  count: number;
}

interface FieldConfig {
  keypressMap?: Record<string, KeypressEntry>;
  keypressDelay?: number;
  format?: string;
}

interface FieldMapping {
  position: number;
  dataSource: string;
  inputType: string;
  staticValue?: string;
  status?: string;
  fieldType?: string;
  dateFormat?: string;
  config?: FieldConfig;
}

interface MappingDetails {
  id: string;
  name: string;
  urlPattern: string;
  formType: string;
  fieldCount: number;
  version: number;
  updatedAt: number;
  createdAt: number;
  fillDelay?: number;
  fields: FieldMapping[];
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MappingDetailsPage() {
  const params = useParams();
  const mappingId = params.id as string;
  
  const [mapping, setMapping] = useState<MappingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load mapping on mount
  useEffect(() => {
    loadMapping();
  }, [mappingId]);
  
  async function loadMapping() {
    try {
      setLoading(true);
      const response = await fetch(`/api/mappings?id=${mappingId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Mapping not found');
        }
        throw new Error('Failed to load mapping');
      }
      
      const data = await response.json();
      setMapping(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }
  
  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Format data source for display (e.g., "traveler.firstName" → "Traveler → First Name")
  function formatDataSource(dataSource: string): string {
    if (!dataSource) return '—';
    const parts = dataSource.split('.');
    const formatted = parts.map(p => 
      p.charAt(0).toUpperCase() + p.slice(1).replace(/([A-Z])/g, ' $1')
    );
    return formatted.join(' → ');
  }
  
  // Format input type for display
  function formatInputType(inputType: string): string {
    const types: Record<string, string> = {
      'paste': 'Paste',
      'keypress': 'Keypress Navigation',
      'click': 'Click',
      'select-match': 'Select (Match Text)',
      'select-keypress': 'Select (Keypress)',
      'date-text': 'Date (Text)',
      'date-dropdowns': 'Date (Dropdowns)',
      'date-picker': 'Date (Picker)',
      'radio': 'Radio Button',
      'checkbox': 'Checkbox'
    };
    return types[inputType] || inputType || 'Paste';
  }
  
  // Format field type for display
  function formatFieldType(fieldType: string): string {
    const types: Record<string, string> = {
      'text': 'Text',
      'date': 'Date',
      'dropdown': 'Dropdown',
      'select': 'Select',
      'radio': 'Radio',
      'checkbox': 'Checkbox'
    };
    return types[fieldType] || fieldType || '—';
  }
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="details-page">
      <style jsx>{`
        .details-page {
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
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          font-size: 14px;
          transition: color 0.2s ease;
        }
        
        .back-link:hover {
          color: white;
        }
        
        .header-title {
          font-size: 20px;
          font-weight: 600;
          flex: 1;
        }
        
        .badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 30px 20px;
        }
        
        .loading, .error-state {
          text-align: center;
          padding: 60px 20px;
        }
        
        .error-state {
          color: #dc2626;
        }
        
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          margin-bottom: 24px;
          overflow: hidden;
        }
        
        .card-header {
          padding: 16px 24px;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 600;
          color: #1e293b;
          font-size: 16px;
        }
        
        .card-body {
          padding: 24px;
        }
        
        .info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }
        
        .info-item {
          background: #f8fafc;
          padding: 16px;
          border-radius: 8px;
        }
        
        .info-label {
          font-size: 12px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        
        .info-value {
          font-size: 15px;
          color: #1e293b;
          font-weight: 500;
        }
        
        .info-value.mono {
          font-family: 'SF Mono', Monaco, 'Consolas', monospace;
          font-size: 13px;
          word-break: break-all;
        }
        
        .type-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
        }
        
        .type-static {
          background: #dbeafe;
          color: #1d4ed8;
        }
        
        .type-dynamic {
          background: #dcfce7;
          color: #16a34a;
        }
        
        .fields-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .fields-table th,
        .fields-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 14px;
        }
        
        .fields-table th {
          background: #f8fafc;
          font-weight: 500;
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .fields-table tr:last-child td {
          border-bottom: none;
        }
        
        .fields-table tr:hover td {
          background: #f8fafc;
        }
        
        .status-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .status-data {
          background: #dcfce7;
          color: #16a34a;
        }
        
        .status-static {
          background: #fef3c7;
          color: #d97706;
        }
        
        .status-unmapped {
          background: #f1f5f9;
          color: #64748b;
        }
        
        .status-ignore {
          background: #fee2e2;
          color: #dc2626;
        }
        
        .input-type-badge {
          display: inline-block;
          background: #e0e7ff;
          color: #4338ca;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .field-type-badge {
          display: inline-block;
          background: #f1f5f9;
          color: #475569;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .keypress-map {
          margin-top: 8px;
        }
        
        .keypress-title {
          font-size: 11px;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }
        
        .keypress-entries {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .keypress-entry {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          background: #f8fafc;
          padding: 6px 10px;
          border-radius: 4px;
        }
        
        .keypress-value {
          font-weight: 600;
          color: #1e293b;
          min-width: 60px;
        }
        
        .keypress-arrow {
          color: #94a3b8;
        }
        
        .keypress-key {
          font-family: 'SF Mono', Monaco, 'Consolas', monospace;
          background: #e2e8f0;
          padding: 2px 6px;
          border-radius: 3px;
          color: #334155;
        }
        
        .keypress-count {
          color: #64748b;
          font-size: 11px;
        }
        
        .config-detail {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }
        
        .config-detail strong {
          color: #475569;
        }
        
        .empty-cell {
          color: #94a3b8;
        }
        
        .field-details-cell {
          max-width: 300px;
        }
        
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        
        .btn-secondary {
          background: #e2e8f0;
          color: #475569;
        }
        
        .btn-secondary:hover {
          background: #cbd5e1;
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
            Back to Dashboard
          </Link>
          <h1 className="header-title">
            {mapping ? mapping.name : 'Loading...'}
          </h1>
          <span className="badge">Read-Only</span>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container">
        {loading ? (
          <div className="loading">Loading mapping details...</div>
        ) : error ? (
          <div className="error-state">
            <p>{error}</p>
            <Link href="/admin" className="btn btn-secondary" style={{ marginTop: '16px' }}>
              Return to Dashboard
            </Link>
          </div>
        ) : mapping ? (
          <>
            {/* Basic Information */}
            <div className="card">
              <div className="card-header">Basic Information</div>
              <div className="card-body">
                <div className="info-grid">
                  <div className="info-item">
                    <div className="info-label">Mapping ID</div>
                    <div className="info-value mono">{mapping.id}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">URL Pattern</div>
                    <div className="info-value mono">{mapping.urlPattern}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Form Type</div>
                    <div className="info-value">
                      <span className={`type-badge ${mapping.formType === 'dynamic-guest-blocks' ? 'type-dynamic' : 'type-static'}`}>
                        {mapping.formType === 'dynamic-guest-blocks' ? 'Dynamic (Multiple Guests)' : 'Static (Single Form)'}
                      </span>
                    </div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Fill Delay</div>
                    <div className="info-value">{mapping.fillDelay || 100}ms</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Version</div>
                    <div className="info-value">v{mapping.version}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Total Fields</div>
                    <div className="info-value">{mapping.fields?.length || 0}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Created</div>
                    <div className="info-value">{formatDate(mapping.createdAt)}</div>
                  </div>
                  <div className="info-item">
                    <div className="info-label">Last Updated</div>
                    <div className="info-value">{formatDate(mapping.updatedAt)}</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Field Mappings */}
            <div className="card">
              <div className="card-header">Field Mappings ({mapping.fields?.length || 0} fields)</div>
              <div className="card-body" style={{ padding: 0 }}>
                {mapping.fields && mapping.fields.length > 0 ? (
                  <table className="fields-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>#</th>
                        <th style={{ width: '100px' }}>Status</th>
                        <th>Data Source / Value</th>
                        <th style={{ width: '140px' }}>Input Type</th>
                        <th style={{ width: '100px' }}>Field Type</th>
                        <th>Configuration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapping.fields.map((field, index) => {
                        const status = field.status || (field.staticValue ? 'static' : (field.dataSource ? 'data' : 'unmapped'));
                        const hasKeypressMap = field.config?.keypressMap && Object.keys(field.config.keypressMap).length > 0;
                        
                        return (
                          <tr key={index}>
                            <td><strong>{field.position}</strong></td>
                            <td>
                              <span className={`status-badge status-${status}`}>
                                {status}
                              </span>
                            </td>
                            <td>
                              {status === 'static' ? (
                                <span>
                                  <strong>Static:</strong> {field.staticValue || <span className="empty-cell">empty</span>}
                                </span>
                              ) : status === 'data' ? (
                                formatDataSource(field.dataSource)
                              ) : (
                                <span className="empty-cell">—</span>
                              )}
                            </td>
                            <td>
                              <span className="input-type-badge">
                                {formatInputType(field.inputType)}
                              </span>
                            </td>
                            <td>
                              {field.fieldType ? (
                                <span className="field-type-badge">
                                  {formatFieldType(field.fieldType)}
                                </span>
                              ) : (
                                <span className="empty-cell">—</span>
                              )}
                            </td>
                            <td className="field-details-cell">
                              {/* Date Format */}
                              {field.dateFormat && (
                                <div className="config-detail">
                                  <strong>Date Format:</strong> {field.dateFormat}
                                </div>
                              )}
                              
                              {/* Keypress Delay */}
                              {field.config?.keypressDelay && field.config.keypressDelay !== 100 && (
                                <div className="config-detail">
                                  <strong>Keypress Delay:</strong> {field.config.keypressDelay}ms
                                </div>
                              )}
                              
                              {/* Keypress Map */}
                              {hasKeypressMap && (
                                <div className="keypress-map">
                                  <div className="keypress-title">Keypress Mappings</div>
                                  <div className="keypress-entries">
                                    {Object.entries(field.config!.keypressMap!).map(([value, mapping]) => (
                                      <div key={value} className="keypress-entry">
                                        <span className="keypress-value">&quot;{value}&quot;</span>
                                        <span className="keypress-arrow">→</span>
                                        <span className="keypress-key">{mapping.key}</span>
                                        <span className="keypress-count">×{mapping.count}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Show dash if no config */}
                              {!field.dateFormat && !hasKeypressMap && !(field.config?.keypressDelay && field.config.keypressDelay !== 100) && (
                                <span className="empty-cell">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                    No field mappings configured
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

