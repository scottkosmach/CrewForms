/**
 * Excel Templates Admin Page
 * 
 * Lists all Excel templates and provides CRUD operations.
 * Templates define how to fill Excel spreadsheets from passport data.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

interface TemplateSummary {
  id: string;
  name: string;
  urlPattern: string;
  description: string | null;
  templatePath: string;
  sheetCount: number;
  version: number;
  updatedAt: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ExcelTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  
  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);
  
  /**
   * Fetch all templates from API
   */
  async function loadTemplates() {
    try {
      setLoading(true);
      const response = await fetch('/api/excel-templates');
      
      if (!response.ok) {
        throw new Error('Failed to load templates');
      }
      
      const data = await response.json();
      setTemplates(data.templates || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }
  
  /**
   * Delete a template
   */
  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete template "${name}"? This will also delete the associated template file.`)) {
      return;
    }
    
    try {
      setDeletingId(id);
      const response = await fetch(`/api/excel-templates?id=${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete template');
      }
      
      // Remove from local state
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }
  
  /**
   * Format timestamp to readable date
   */
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
        
        .badge {
          background: rgba(255, 255, 255, 0.2);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }
        
        .nav-links {
          display: flex;
          gap: 12px;
        }
        
        .nav-link {
          color: rgba(255, 255, 255, 0.8);
          text-decoration: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s ease;
        }
        
        .nav-link:hover {
          background: rgba(255, 255, 255, 0.15);
          color: white;
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
          background: #059669;
          color: white;
        }
        
        .btn-primary:hover {
          background: #047857;
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
        
        .btn-danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
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
          display: flex;
          justify-content: space-between;
          align-items: center;
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
        
        .template-name {
          font-weight: 500;
          color: #1e293b;
        }
        
        .template-url {
          font-size: 13px;
          color: #64748b;
          font-family: monospace;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .template-desc {
          font-size: 13px;
          color: #64748b;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .sheet-badge {
          background: #ecfdf5;
          color: #047857;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
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
          color: #059669;
        }
        
        .empty-state p {
          margin-bottom: 8px;
        }
        
        .empty-state .hint {
          font-size: 14px;
          color: #94a3b8;
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
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
        
        .info-banner {
          background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
          border: 1px solid #6ee7b7;
          border-radius: 10px;
          padding: 16px 20px;
          margin-bottom: 30px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        
        .info-banner svg {
          flex-shrink: 0;
          color: #059669;
        }
        
        .info-banner-content {
          flex: 1;
        }
        
        .info-banner-title {
          font-weight: 600;
          color: #065f46;
          margin-bottom: 4px;
        }
        
        .info-banner-text {
          font-size: 14px;
          color: #047857;
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
            Excel Templates
            <span className="badge">Admin</span>
          </div>
          <nav className="nav-links">
            <Link href="/admin" className="nav-link">
              ← Field Mappings
            </Link>
          </nav>
        </div>
      </header>
      
      {/* Main Content */}
      <main className="container">
        <div className="page-header">
          <h1 className="page-title">Excel Templates</h1>
          <Link href="/admin/excel-templates/new" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Template
          </Link>
        </div>
        
        {/* Info Banner */}
        <div className="info-banner">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <div className="info-banner-content">
            <div className="info-banner-title">Excel Template Generation</div>
            <div className="info-banner-text">
              Create templates to generate pre-filled Excel spreadsheets from passport data.
              Upload a blank template file and configure column mappings for each sheet.
            </div>
          </div>
        </div>
        
        {/* Stats */}
        <div className="stats">
          <div className="stat-card">
            <div className="stat-value">{templates.length}</div>
            <div className="stat-label">Total Templates</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {templates.reduce((sum, t) => sum + t.sheetCount, 0)}
            </div>
            <div className="stat-label">Configured Sheets</div>
          </div>
        </div>
        
        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <span>Error: {error}</span>
            <button onClick={loadTemplates} className="btn btn-sm btn-secondary">
              Retry
            </button>
          </div>
        )}
        
        {/* Templates Table */}
        <div className="card">
          <div className="card-header">
            <span>All Templates</span>
            <button onClick={loadTemplates} className="btn btn-sm btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
          </div>
          
          {loading ? (
            <div className="loading">Loading templates...</div>
          ) : templates.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="16" y2="17"/>
              </svg>
              <p>No Excel templates configured yet</p>
              <p className="hint">Create a template to generate filled Excel files from passport data</p>
              <Link href="/admin/excel-templates/new" className="btn btn-primary">
                Create First Template
              </Link>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>URL Pattern</th>
                  <th>Description</th>
                  <th>Sheets</th>
                  <th>Version</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(template => (
                  <tr key={template.id}>
                    <td>
                      <div className="template-name">{template.name}</div>
                    </td>
                    <td>
                      <div className="template-url" title={template.urlPattern}>
                        {template.urlPattern}
                      </div>
                    </td>
                    <td>
                      <div className="template-desc" title={template.description || ''}>
                        {template.description || '—'}
                      </div>
                    </td>
                    <td>
                      <span className="sheet-badge">
                        {template.sheetCount} sheet{template.sheetCount !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>
                      <span className="version-badge">v{template.version}</span>
                    </td>
                    <td>{formatDate(template.updatedAt)}</td>
                    <td>
                      <div className="actions">
                        <Link 
                          href={`/admin/excel-templates/${template.id}`}
                          className="btn btn-sm btn-secondary"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(template.id, template.name)}
                          className="btn btn-sm btn-danger"
                          disabled={deletingId === template.id}
                        >
                          {deletingId === template.id ? '...' : 'Delete'}
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

