/**
 * Mobile Upload Page
 * 
 * Simple, mobile-optimized page for uploading passport images.
 * Accessed by scanning QR code from the extension.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

interface UploadState {
  status: 'idle' | 'selecting' | 'converting' | 'uploading' | 'success' | 'error' | 'expired';
  message: string;
  progress: number;
}

// Maximum dimension (width or height) for converted images
const MAX_IMAGE_DIMENSION = 2400;
// JPEG quality (0.0 - 1.0). 0.85 is a good balance of quality vs size
const JPEG_QUALITY = 0.85;

/**
 * Convert any image file to JPEG using canvas.
 * Handles HEIC, HEIF (live photos), PNG (iPhone screenshots), WebP, etc.
 * Also resizes if the image exceeds MAX_IMAGE_DIMENSION to reduce payload size.
 */
function convertToJpeg(file: File): Promise<{ blob: Blob; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    // Create an object URL for the file — this lets the browser decode
    // HEIC/HEIF natively on iOS Safari without a separate library
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        let { width, height } = img;

        // Scale down if either dimension exceeds the max
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw image onto canvas (this converts any format the browser can decode)
        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error('Failed to convert image to JPEG'));
              return;
            }
            // Also generate a data URL for preview
            const reader = new FileReader();
            reader.onload = () => resolve({ blob, dataUrl: reader.result as string });
            reader.onerror = () => reject(new Error('Failed to read converted blob'));
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          JPEG_QUALITY
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Browser cannot decode image: ${file.name} (${file.type})`));
    };

    img.src = objectUrl;
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function UploadPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  
  const [state, setState] = useState<UploadState>({
    status: 'idle',
    message: '',
    progress: 0
  });
  
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [convertedBlobs, setConvertedBlobs] = useState<Blob[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Check session validity on mount
  useEffect(() => {
    checkSession();
  }, [sessionId]);
  
  /**
   * Check if the session is still valid
   */
  async function checkSession() {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      
      if (response.status === 404) {
        setState({
          status: 'expired',
          message: 'This upload session has expired. Please generate a new QR code.',
          progress: 0
        });
      }
    } catch (error) {
      console.error('Failed to check session:', error);
    }
  }
  
  /**
   * Handle file selection — converts all images to JPEG for maximum
   * compatibility with the OpenAI Vision OCR API.
   * Handles HEIC/HEIF (iPhone live photos), PNG (screenshots), WebP, etc.
   */
  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) return;

    // Filter to only images (includes HEIC/HEIF which report as image/heic)
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      setState({
        status: 'error',
        message: 'Please select image files only.',
        progress: 0
      });
      return;
    }

    setSelectedFiles(imageFiles);

    // Show converting status
    setState({
      status: 'converting',
      message: `Converting ${imageFiles.length} image(s) to JPEG...`,
      progress: 0
    });

    // Convert all images to JPEG
    const newPreviews: string[] = [];
    const newBlobs: Blob[] = [];
    let failedCount = 0;

    for (let i = 0; i < imageFiles.length; i++) {
      try {
        setState({
          status: 'converting',
          message: `Converting image ${i + 1} of ${imageFiles.length}...`,
          progress: Math.round(((i) / imageFiles.length) * 100)
        });

        const { blob, dataUrl } = await convertToJpeg(imageFiles[i]);
        newBlobs.push(blob);
        newPreviews.push(dataUrl);
      } catch (error) {
        console.error(`Failed to convert ${imageFiles[i].name}:`, error);
        failedCount++;
      }
    }

    setConvertedBlobs(newBlobs);
    setPreviews(newPreviews);

    if (newBlobs.length === 0) {
      setState({
        status: 'error',
        message: 'Could not convert any images. Please try different photos.',
        progress: 0
      });
    } else {
      setState({
        status: 'selecting',
        message: failedCount > 0
          ? `${newBlobs.length} image(s) ready. ${failedCount} could not be converted.`
          : `${newBlobs.length} image(s) ready to upload`,
        progress: 0
      });
    }
  }
  
  /**
   * Upload converted JPEG blobs
   */
  async function handleUpload() {
    if (convertedBlobs.length === 0) return;

    const total = convertedBlobs.length;
    let uploaded = 0;
    let failed = 0;

    setState({
      status: 'uploading',
      message: `Uploading image 1 of ${total}...`,
      progress: 0
    });

    // Upload images one at a time to stay under Vercel's 4.5MB body limit
    for (let i = 0; i < total; i++) {
      try {
        const formData = new FormData();
        // Send as .jpg file — the blob is already JPEG from convertToJpeg()
        const jpegFile = new File([convertedBlobs[i]], `passport-${i + 1}.jpg`, {
          type: 'image/jpeg'
        });
        formData.append('images', jpegFile);

        setState({
          status: 'uploading',
          message: `Uploading image ${i + 1} of ${total}...`,
          progress: Math.round((i / total) * 100)
        });

        const response = await fetch(`/api/sessions/${sessionId}/upload`, {
          method: 'POST',
          body: formData
        });

        if (response.status === 404 || response.status === 410) {
          setState({
            status: 'expired',
            message: 'This upload session has expired. Please generate a new QR code.',
            progress: 0
          });
          return;
        }

        if (!response.ok) {
          console.error(`Upload failed for image ${i + 1}: status ${response.status}`);
          failed++;
          continue;
        }

        uploaded++;
      } catch (error) {
        console.error(`Upload error for image ${i + 1}:`, error);
        failed++;
      }
    }

    if (uploaded === 0) {
      setState({
        status: 'error',
        message: 'Failed to upload images. Please try again.',
        progress: 0
      });
    } else {
      setState({
        status: 'success',
        message: failed > 0
          ? `${uploaded} of ${total} image(s) uploaded. ${failed} failed.`
          : `${uploaded} passport image(s) uploaded successfully!`,
        progress: 100
      });
      setSelectedFiles([]);
      setConvertedBlobs([]);
      setPreviews([]);
    }
  }
  
  /**
   * Clear selection and start over
   */
  function handleClear() {
    setSelectedFiles([]);
    setConvertedBlobs([]);
    setPreviews([]);
    setState({
      status: 'idle',
      message: '',
      progress: 0
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="upload-page">
      <style jsx>{`
        .upload-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #1e3a5f 0%, #0f1f33 100%);
          color: white;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .container {
          max-width: 400px;
          margin: 0 auto;
        }
        
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .logo {
          font-size: 24px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .logo-icon {
          display: inline-block;
          width: 32px;
          height: 32px;
          margin-right: 8px;
          vertical-align: middle;
        }
        
        .subtitle {
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
        }
        
        .card {
          background: white;
          color: #1e293b;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 16px;
        }
        
        .select-area {
          border: 2px dashed #0891b2;
          border-radius: 12px;
          padding: 40px 20px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: rgba(8, 145, 178, 0.06);
        }
        
        .select-area:hover {
          border-color: #0891b2;
          background: rgba(8, 145, 178, 0.1);
        }

        .select-area:active {
          transform: scale(0.98);
          background: rgba(8, 145, 178, 0.12);
        }
        
        .select-area.has-files {
          border-style: solid;
          border-color: #0891b2;
          background: rgba(8, 145, 178, 0.05);
        }
        
        .select-icon {
          width: 48px;
          height: 48px;
          margin: 0 auto 16px;
          color: #0891b2;
        }
        
        .select-text {
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 8px;
          color: #0891b2;
        }
        
        .select-hint {
          font-size: 14px;
          color: #64748b;
        }
        
        .previews {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-top: 16px;
        }
        
        .preview-item {
          position: relative;
          aspect-ratio: 3/4;
          border-radius: 8px;
          overflow: hidden;
          background: #f1f5f9;
        }
        
        .preview-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .preview-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.6);
          color: white;
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
        }
        
        .file-input {
          display: none;
        }
        
        .btn {
          display: block;
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 600;
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
          margin-top: 12px;
        }
        
        .btn-secondary:hover {
          background: #cbd5e1;
        }
        
        .status-message {
          text-align: center;
          padding: 16px;
          border-radius: 12px;
          margin-bottom: 16px;
        }
        
        .status-success {
          background: rgba(16, 185, 129, 0.1);
          color: #065f46;
        }
        
        .status-error {
          background: rgba(239, 68, 68, 0.1);
          color: #991b1b;
        }
        
        .status-expired {
          background: rgba(245, 158, 11, 0.1);
          color: #92400e;
        }
        
        .status-uploading {
          background: rgba(8, 145, 178, 0.1);
          color: #0e7490;
        }
        
        .progress-bar {
          height: 4px;
          background: #e2e8f0;
          border-radius: 2px;
          margin-top: 12px;
          overflow: hidden;
        }
        
        .progress-bar-fill {
          height: 100%;
          background: #0891b2;
          transition: width 0.3s ease;
        }
        
        .instructions {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
          margin-top: 20px;
        }
        
        .instructions h3 {
          font-size: 14px;
          margin-bottom: 12px;
          color: rgba(255, 255, 255, 0.9);
        }
        
        .instructions ol {
          margin: 0;
          padding-left: 20px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 14px;
          line-height: 1.6;
        }
      `}</style>
      
      <div className="container">
        <header className="header">
          <div className="logo">
            <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            CrewForms
          </div>
          <p className="subtitle">Upload Passport Images</p>
        </header>
        
        {/* Status Messages */}
        {state.status === 'expired' && (
          <div className="status-message status-expired">
            <p>{state.message}</p>
          </div>
        )}
        
        {state.status === 'success' && (
          <div className="status-message status-success">
            <p>✓ {state.message}</p>
          </div>
        )}
        
        {state.status === 'error' && (
          <div className="status-message status-error">
            <p>⚠ {state.message}</p>
          </div>
        )}
        
        {state.status === 'converting' && (
          <div className="status-message status-uploading">
            <p>{state.message}</p>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}

        {state.status === 'uploading' && (
          <div className="status-message status-uploading">
            <p>{state.message}</p>
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Main Upload Card */}
        {state.status !== 'expired' && (
          <div className="card">
            <div 
              className={`select-area ${selectedFiles.length > 0 ? 'has-files' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              <svg className="select-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
              <p className="select-text">
                {selectedFiles.length > 0 
                  ? `${selectedFiles.length} image(s) selected` 
                  : 'Tap to select passport images'
                }
              </p>
              <p className="select-hint">
                {selectedFiles.length > 0 
                  ? 'Tap again to add more' 
                  : 'Select from gallery or take a photo'
                }
              </p>
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="file-input"
              onChange={handleFileSelect}
            />
            
            {/* Image Previews */}
            {previews.length > 0 && (
              <div className="previews">
                {previews.map((preview, index) => (
                  <div key={index} className="preview-item">
                    <img src={preview} alt={`Passport ${index + 1}`} />
                    <span className="preview-badge">{index + 1}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Upload Button */}
            <button
              className="btn btn-primary"
              onClick={convertedBlobs.length === 0 ? () => fileInputRef.current?.click() : handleUpload}
              disabled={state.status === 'uploading' || state.status === 'converting'}
              style={{ marginTop: '20px' }}
            >
              {state.status === 'converting'
                ? 'Converting...'
                : state.status === 'uploading'
                  ? 'Uploading...'
                  : convertedBlobs.length === 0
                    ? 'Select Passport Images'
                    : `Upload ${convertedBlobs.length} Image${convertedBlobs.length !== 1 ? 's' : ''}`
              }
            </button>

            {/* Clear Button */}
            {selectedFiles.length > 0 && state.status !== 'uploading' && state.status !== 'converting' && (
              <button
                className="btn btn-secondary"
                onClick={handleClear}
              >
                Clear Selection
              </button>
            )}
          </div>
        )}
        
        {/* Instructions */}
        <div className="instructions">
          <h3>How to use:</h3>
          <ol>
            <li>Select passport images from your camera roll</li>
            <li>Make sure the passport photo page is clearly visible</li>
            <li>Tap &quot;Upload&quot; to send to your computer</li>
            <li>The images will appear in the CrewForms extension</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

