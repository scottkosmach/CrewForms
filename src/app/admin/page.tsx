/**
 * Admin Dashboard Page
 * 
 * Main entry point for the admin interface.
 * Lists all field mappings and provides navigation to create/edit.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

interface MappingSummary {
  id: string;
  name: string;
  urlPattern: string;
  formType: string;
  fieldCount: number;
  version: number;
  updatedAt: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function AdminDashboard() {
  const [mappings, setMappings] = useState<MappingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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
  
  async function deleteMapping(id: string) {
    if (!confirm('Are you sure you want to delete this mapping?')) return;
    
    try {
      const response = await fetch(`/api/mappings?id=${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete mapping');
      }
      
      // Reload mappings
      await loadMappings();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
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
          margin-bottom: 30px;
        }
        
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: #1e293b;
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
          background: #0891b2;
          color: white;
        }
        
        .btn-primary:hover {
          background: #0e7490;
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
        }
        
        .btn-danger:hover {
          background: #fecaca;
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
        
        .actions {
          display: flex;
          gap: 8px;
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
          margin-bottom: 20px;
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
            <span className="badge">Admin</span>
          </div>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container">
        <div className="page-header">
          <h1 className="page-title">Field Mappings</h1>
          <Link href="/admin/mappings/new" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Mapping
          </Link>
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
              <Link href="/admin/mappings/new" className="btn btn-primary">
                Create Your First Mapping
              </Link>
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
                      <div className="actions">
                        <Link href={`/admin/mappings/${mapping.id}`} className="btn btn-sm btn-secondary">
                          Edit
                        </Link>
                        <button 
                          onClick={() => deleteMapping(mapping.id)} 
                          className="btn btn-sm btn-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

