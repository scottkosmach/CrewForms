/**
 * Admin Dashboard Page (Read-Only)
 * 
 * View-only dashboard for field mappings.
 * To create or edit mappings, use the Chrome extension's Admin tab.
 */

'use client';

import { useState, useEffect } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface FieldConfig {
  keypressMap?: Record<string, { key: string; count: number }>;
  format?: string;
  keypressDelay?: number;
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

interface MappingSummary {
  id: string;
  name: string;
  urlPattern: string;
  formType: string;
  fieldCount: number;
  version: number;
  updatedAt: number;
}

interface MappingDetails extends MappingSummary {
  fields: FieldMapping[];
  fillDelay?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AdminDashboard() {
  const [mappings, setMappings] = useState<MappingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for viewing mapping details
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<MappingDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Load mappings on mount
  useEffect(() => {
    loadMappings();
  }, []);
  
  async function loadMappings() {
    try {
      setLoading(true);
      const response = await fetch('/api/mappings');
      
      if (!response.ok) {
        throw new Error('Failed to load mappings');
      }
      
      const data = await response.json();
      setMappings(data.mappings || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }
  
  // Load full mapping details when viewing
  async function loadMappingDetails(id: string) {
    try {
      setLoadingDetails(true);
      const response = await fetch(`/api/mappings?id=${id}`);
      
      if (!response.ok) {
        throw new Error('Failed to load mapping details');
      }
      
      const data = await response.json();
      setSelectedMapping(data);
      setSelectedMappingId(id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to load details');
    } finally {
      setLoadingDetails(false);
    }
  }
  
  // Close the details panel
  function closeDetails() {
    setSelectedMappingId(null);
    setSelectedMapping(null);
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
  
  // Format data source for display
  function formatDataSource(dataSource: string): string {
    if (!dataSource) return '—';
    // Convert "traveler.firstName" to "Traveler → First Name"
    const parts = dataSource.split('.');
    const formatted = parts.map(p => 
      p.charAt(0).toUpperCase() + p.slice(1).replace(/([A-Z])/g, ' $1')
    );
    return formatted.join(' → ');
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
        
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }
        
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: #1e293b;
        }
        
        .info-banner {
          background: linear-gradient(135deg, #dbeafe 0%, #e0e7ff 100%);
          border: 1px solid #93c5fd;
          border-radius: 10px;
          padding: 16px 20px;
          margin-bottom: 30px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        
        .info-banner svg {
          flex-shrink: 0;
          color: #3b82f6;
        }
        
        .info-banner-content {
          flex: 1;
        }
        
        .info-banner-title {
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 4px;
        }
        
        .info-banner-text {
          font-size: 14px;
          color: #1e3a8a;
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
        
        .btn-secondary {
          background: #e2e8f0;
          color: #475569;
        }
        
        .btn-secondary:hover {
          background: #cbd5e1;
        }
        
        .btn-download {
          background: rgba(255, 255, 255, 0.15);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }
        
        .btn-download:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
        }
        
        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
        }
        
        .card {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        
        .card-header {
          padding: 16px 20px;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 600;
          color: #1e293b;
        }
        
        .table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .table th,
        .table td {
          padding: 14px 20px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .table th {
          background: #f8fafc;
          font-weight: 500;
          color: #64748b;
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .table tr:last-child td {
          border-bottom: none;
        }
        
        .table tr:hover td {
          background: #f8fafc;
        }
        
        .mapping-name {
          font-weight: 500;
          color: #1e293b;
        }
        
        .mapping-url {
          font-size: 13px;
          color: #64748b;
          font-family: monospace;
        }
        
        .type-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
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
        
        .version-badge {
          background: #f1f5f9;
          color: #64748b;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
        }
        
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: #64748b;
        }
        
        .empty-state svg {
          width: 48px;
          height: 48px;
          margin-bottom: 16px;
          opacity: 0.5;
        }
        
        .empty-state p {
          margin-bottom: 8px;
        }
        
        .empty-state .hint {
          font-size: 14px;
          color: #94a3b8;
        }
        
        .loading {
          text-align: center;
          padding: 60px 20px;
          color: #64748b;
        }
        
        .error-banner {
          background: #fee2e2;
          color: #dc2626;
          padding: 12px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }
        
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }
        
        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .stat-value {
          font-size: 32px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 4px;
        }
        
        .stat-label {
          font-size: 14px;
          color: #64748b;
        }
        
        /* Details Modal Overlay */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        
        .modal {
          background: white;
          border-radius: 16px;
          width: 100%;
          max-width: 800px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .modal-header {
          padding: 20px 24px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .modal-title {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }
        
        .modal-close {
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          color: #64748b;
          border-radius: 6px;
        }
        
        .modal-close:hover {
          background: #f1f5f9;
          color: #1e293b;
        }
        
        .modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        
        .detail-section {
          margin-bottom: 24px;
        }
        
        .detail-section:last-child {
          margin-bottom: 0;
        }
        
        .detail-section-title {
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
        }
        
        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        
        .detail-item {
          background: #f8fafc;
          padding: 12px 16px;
          border-radius: 8px;
        }
        
        .detail-label {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 4px;
        }
        
        .detail-value {
          font-size: 14px;
          color: #1e293b;
          font-weight: 500;
        }
        
        .detail-value.mono {
          font-family: monospace;
          font-size: 13px;
        }
        
        .fields-table {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        
        .fields-table th,
        .fields-table td {
          padding: 10px 14px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 13px;
        }
        
        .fields-table th {
          background: #f8fafc;
          font-weight: 500;
          color: #64748b;
        }
        
        .fields-table tr:last-child td {
          border-bottom: none;
        }
        
        .input-type-badge {
          background: #f1f5f9;
          color: #475569;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }
        
        .status-badge {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
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
        
        .modal-loading {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
      `}</style>
      
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            CrewForms
            <span className="badge">Dashboard</span>
          </div>
          {/* Download Extension Button */}
          <a 
            href="/crewforms-extension.zip"
            className="btn btn-download"
            download
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Extension
          </a>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container">
        <div className="page-header">
          <h1 className="page-title">Field Mappings</h1>
        </div>
        
        {/* Info Banner - direct users to extension */}
        <div className="info-banner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 16v-4"/>
            <path d="M12 8h.01"/>
          </svg>
          <div className="info-banner-content">
            <div className="info-banner-title">Read-Only Dashboard</div>
            <div className="info-banner-text">
              To create, edit, or delete mappings, use the <strong>Admin tab</strong> in the CrewForms Chrome extension.
              Navigate to the target form page, open the extension sidebar, and use the Mapping Assistant.
            </div>
          </div>
        </div>
        
        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">{mappings.length}</div>
            <div className="stat-label">Total Mappings</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {mappings.filter(m => m.formType === 'dynamic-guest-blocks').length}
            </div>
            <div className="stat-label">Dynamic Forms</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {mappings.reduce((sum, m) => sum + m.fieldCount, 0)}
            </div>
            <div className="stat-label">Total Fields</div>
          </div>
        </div>
        
        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            Error: {error}
            <button onClick={loadMappings} className="btn btn-sm btn-secondary" style={{ marginLeft: '12px' }}>
              Retry
            </button>
          </div>
        )}
        
        {/* Mappings Table */}
        <div className="card">
          <div className="card-header">All Mappings</div>
          
          {loading ? (
            <div className="loading">Loading mappings...</div>
          ) : mappings.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4"/>
                <line x1="12" y1="3" x2="12" y2="21"/>
              </svg>
              <p>No field mappings configured yet</p>
              <p className="hint">Use the Chrome extension&apos;s Admin tab to create your first mapping</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL Pattern</th>
                  <th>Type</th>
                  <th>Fields</th>
                  <th>Version</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(mapping => (
                  <tr key={mapping.id}>
                    <td>
                      <div className="mapping-name">{mapping.name}</div>
                    </td>
                    <td>
                      <div className="mapping-url">{mapping.urlPattern}</div>
                    </td>
                    <td>
                      <span className={`type-badge ${mapping.formType === 'dynamic-guest-blocks' ? 'type-dynamic' : 'type-static'}`}>
                        {mapping.formType === 'dynamic-guest-blocks' ? 'Dynamic' : 'Static'}
                      </span>
                    </td>
                    <td>{mapping.fieldCount}</td>
                    <td>
                      <span className="version-badge">v{mapping.version}</span>
                    </td>
                    <td>{formatDate(mapping.updatedAt)}</td>
                    <td>
                      <button 
                        onClick={() => loadMappingDetails(mapping.id)} 
                        className="btn btn-sm btn-secondary"
                        disabled={loadingDetails && selectedMappingId === mapping.id}
                      >
                        {loadingDetails && selectedMappingId === mapping.id ? 'Loading...' : 'View Details'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
      
      {/* Details Modal */}
      {selectedMappingId && (
        <div className="modal-overlay" onClick={closeDetails}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {selectedMapping ? selectedMapping.name : 'Loading...'}
              </h2>
              <button className="modal-close" onClick={closeDetails}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              {!selectedMapping ? (
                <div className="modal-loading">Loading mapping details...</div>
              ) : (
                <>
                  {/* Basic Info */}
                  <div className="detail-section">
                    <h3 className="detail-section-title">Basic Information</h3>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <div className="detail-label">URL Pattern</div>
                        <div className="detail-value mono">{selectedMapping.urlPattern}</div>
                      </div>
                      <div className="detail-item">
                        <div className="detail-label">Form Type</div>
                        <div className="detail-value">
                          {selectedMapping.formType === 'dynamic-guest-blocks' ? 'Dynamic (Multiple Guests)' : 'Static (Single Form)'}
                        </div>
                      </div>
                      <div className="detail-item">
                        <div className="detail-label">Version</div>
                        <div className="detail-value">v{selectedMapping.version}</div>
                      </div>
                      <div className="detail-item">
                        <div className="detail-label">Fill Delay</div>
                        <div className="detail-value">{selectedMapping.fillDelay || 100}ms</div>
                      </div>
                      <div className="detail-item">
                        <div className="detail-label">Last Updated</div>
                        <div className="detail-value">{formatDate(selectedMapping.updatedAt)}</div>
                      </div>
                      <div className="detail-item">
                        <div className="detail-label">Field Count</div>
                        <div className="detail-value">{selectedMapping.fields?.length || 0} fields</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Field Mappings */}
                  <div className="detail-section">
                    <h3 className="detail-section-title">Field Mappings</h3>
                    {selectedMapping.fields && selectedMapping.fields.length > 0 ? (
                      <table className="fields-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Status</th>
                            <th>Data Source</th>
                            <th>Input Type</th>
                            <th>Static Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedMapping.fields.map((field, index) => (
                            <tr key={index}>
                              <td>{field.position}</td>
                              <td>
                                <span className={`status-badge status-${field.status || 'unmapped'}`}>
                                  {field.status || 'unmapped'}
                                </span>
                              </td>
                              <td>{formatDataSource(field.dataSource)}</td>
                              <td>
                                <span className="input-type-badge">{field.inputType || 'paste'}</span>
                              </td>
                              <td>{field.staticValue || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p style={{ color: '#64748b', fontSize: '14px' }}>No field mappings configured</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
