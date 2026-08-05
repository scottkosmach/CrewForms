/**
 * CrewForms Background Service Worker
 * 
 * Responsibilities:
 * - Manages session state for image uploads
 * - Communicates with server (session creation, image relay, OCR proxy, mapping fetch)
 * - Coordinates between side panel and content scripts
 * - Handles data expiry cleanup
 */

// ============================================================================
// CONSTANTS
// ============================================================================

// Server URL - points to the Vercel deployment
const SERVER_URL = 'https://crewforms.vercel.app';

// Data expiry time in milliseconds (12 hours)
const DATA_EXPIRY_MS = 12 * 60 * 60 * 1000;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the extension when installed or updated
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('CrewForms extension installed/updated:', details.reason);
  
  // Set up side panel behavior - open on action click
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  
  // Initialize storage with default structure if needed
  await initializeStorage();
  
  // Start the expiry cleanup interval
  startExpiryCleanup();
});

/**
 * Initialize storage with default structure
 */
async function initializeStorage() {
  const data = await chrome.storage.local.get(null);
  
  // Set up default structure if not present
  const defaults = {
    captain: null,           // Captain's personal info
    boats: [],               // Array of boat objects
    companies: [],           // Array of company objects
    trips: [],               // Array of trip objects (with expiry)
    travelers: [],           // Array of traveler objects (with expiry)
    travelerImages: {},      // Map of traveler ID to base64 image (with expiry)
    pendingImageBuffer: [],  // Images that failed to deliver to side panel (retry buffer)
    settings: {
      serverUrl: SERVER_URL,
      autoExpiry: true
    }
  };
  
  // Only set defaults for missing keys
  const toSet = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in data)) {
      toSet[key] = value;
    }
  }
  
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
    console.log('Initialized storage with defaults:', Object.keys(toSet));
  }
}

// ============================================================================
// DATA EXPIRY MANAGEMENT
// ============================================================================

/**
 * Start the periodic cleanup of expired data
 */
function startExpiryCleanup() {
  // Run cleanup every 5 minutes
  setInterval(cleanupExpiredData, 5 * 60 * 1000);
  
  // Also run immediately
  cleanupExpiredData();
}

/**
 * Remove expired traveler data, images, and trips
 */
async function cleanupExpiredData() {
  const now = Date.now();
  const data = await chrome.storage.local.get(['travelers', 'travelerImages', 'trips']);
  
  let changed = false;
  
  // Clean up expired travelers
  if (data.travelers && Array.isArray(data.travelers)) {
    const validTravelers = data.travelers.filter(t => {
      const isValid = !t.expiresAt || t.expiresAt > now;
      if (!isValid) {
        console.log('Removing expired traveler:', t.id);
      }
      return isValid;
    });
    
    if (validTravelers.length !== data.travelers.length) {
      data.travelers = validTravelers;
      changed = true;
    }
  }
  
  // Clean up expired traveler images
  if (data.travelerImages && typeof data.travelerImages === 'object') {
    const validImages = {};
    for (const [id, imageData] of Object.entries(data.travelerImages)) {
      if (!imageData.expiresAt || imageData.expiresAt > now) {
        validImages[id] = imageData;
      } else {
        console.log('Removing expired traveler image:', id);
        changed = true;
      }
    }
    data.travelerImages = validImages;
  }
  
  // Clean up expired trips
  if (data.trips && Array.isArray(data.trips)) {
    const validTrips = data.trips.filter(t => {
      const isValid = !t.expiresAt || t.expiresAt > now;
      if (!isValid) {
        console.log('Removing expired trip:', t.id);
      }
      return isValid;
    });
    
    if (validTrips.length !== data.trips.length) {
      data.trips = validTrips;
      changed = true;
    }
  }
  
  // Save changes if any
  if (changed) {
    await chrome.storage.local.set({
      travelers: data.travelers,
      travelerImages: data.travelerImages,
      trips: data.trips
    });
    
    // Notify side panel of changes
    notifySidePanel({ type: 'DATA_EXPIRED' });
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Handle messages from side panel and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  // Handle async operations
  handleMessage(message, sender)
    .then(response => sendResponse(response))
    .catch(error => {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    });
  
  // Return true to indicate async response
  return true;
});

/**
 * Route messages to appropriate handlers
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    // Storage operations
    case 'GET_STORAGE':
      return await getStorageData(message.keys);
    
    case 'SET_STORAGE':
      return await setStorageData(message.data);
    
    // Session management
    case 'CREATE_SESSION':
      return await createUploadSession();
    
    case 'CHECK_SESSION':
      return await checkSessionStatus(message.sessionId);
    
    case 'START_POLLING':
      return await startSessionPolling(message.sessionId);
    
    case 'STOP_POLLING':
      return stopSessionPolling(message.sessionId);
    
    // OCR operations
    case 'PROCESS_OCR':
      return await processOCR(message.imageData);
    
    // Mapping operations
    case 'GET_MAPPING':
      return await getFieldMapping(message.url);
    
    // Excel template operations
    case 'CHECK_EXCEL_TEMPLATE':
      return await checkExcelTemplate(message.url);
    
    case 'GENERATE_EXCEL':
      return await generateExcel(message.templateId, message.data);
    
    // Content script communication
    case 'FILL_FORM':
      return await fillFormFields(message.tabId, message.data, message.mapping);
    
    // Utility
    case 'GET_ACTIVE_TAB':
      return await getActiveTab();
    
    // Forward image overlay closed event to side panel
    case 'IMAGE_OVERLAY_CLOSED':
      notifySidePanel({ type: 'IMAGE_OVERLAY_CLOSED' });
      return { success: true };
    
    // Content script ready notification (ignore)
    case 'CONTENT_SCRIPT_READY':
      console.log('Content script ready on:', message.url);
      return { success: true };
    
    // Focus changed notification from content script (ignore - side panel handles this)
    case 'FOCUS_CHANGED':
      // This is handled by side panel directly, just acknowledge
      return { success: true };
    
    // Image overlay commands - forward to content script
    case 'SHOW_IMAGE_OVERLAY':
      return await showImageOverlayOnTab(message.imageData);
    
    case 'HIDE_IMAGE_OVERLAY':
      return await hideImageOverlayOnTab();
    
    // Scan form fields on a specific tab (injects content script if needed)
    case 'SCAN_FIELDS_ON_TAB':
      return await scanFieldsOnTab(message.tabId);

    // Set autopaste value on active tab's content script
    case 'SET_AUTOPASTE':
      return await setAutoPasteOnTab(message.value);

    default:
      console.log('Unknown message type:', message.type);
      return { success: false, error: `Unknown message type: ${message.type}` };
  }
}

// ============================================================================
// STORAGE OPERATIONS
// ============================================================================

/**
 * Get data from storage
 */
async function getStorageData(keys) {
  const data = await chrome.storage.local.get(keys || null);
  return { success: true, data };
}

/**
 * Set data in storage
 */
async function setStorageData(data) {
  await chrome.storage.local.set(data);
  return { success: true };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Create a new upload session with the server
 */
async function createUploadSession() {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const { sessionId, uploadUrl, expiresAt } = await response.json();
    
    return {
      success: true,
      sessionId,
      uploadUrl,
      expiresAt
    };
  } catch (error) {
    console.error('Failed to create session:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check the status of an upload session
 */
async function checkSessionStatus(sessionId) {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/sessions/${sessionId}`);
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const status = await response.json();
    return { success: true, ...status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Alarm name for polling
const POLLING_ALARM_NAME = 'session-polling';

/**
 * Start polling a session for uploaded images
 * Uses chrome.alarms to persist across service worker restarts
 */
async function startSessionPolling(sessionId) {
  console.log(`[Polling] Starting polling for session ${sessionId}`);
  
  // Store the active session ID so it persists across service worker restarts
  await chrome.storage.local.set({ 
    activePollingSession: sessionId,
    pollingStartTime: Date.now()
  });
  
  // Create an alarm that fires every 2 seconds (minimum is 0.5 minutes for production,
  // but we can use periodInMinutes: 0.033 for ~2 seconds in development)
  // For reliability, we'll poll immediately and use a short alarm period
  await chrome.alarms.create(POLLING_ALARM_NAME, {
    periodInMinutes: 0.05  // ~3 seconds (minimum allowed is about 1 second in practice)
  });
  
  console.log(`[Polling] Created alarm for session ${sessionId}`);
  
  // Do an immediate poll
  await pollSessionForImages(sessionId);
  
  return { success: true };
}

/**
 * Stop polling a session
 */
async function stopSessionPolling(sessionId) {
  console.log(`[Polling] Stopping polling for session ${sessionId}`);
  
  // Clear the alarm
  await chrome.alarms.clear(POLLING_ALARM_NAME);
  
  // Clear stored session
  await chrome.storage.local.remove(['activePollingSession', 'pollingStartTime']);
  
  console.log(`[Polling] Stopped polling session ${sessionId}`);
  return { success: true };
}

/**
 * Handle alarm events - this fires even after service worker restarts
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLLING_ALARM_NAME) {
    // Get the active session from storage
    const data = await chrome.storage.local.get(['activePollingSession', 'pollingStartTime']);
    
    if (!data.activePollingSession) {
      console.log('[Polling] No active session, clearing alarm');
      await chrome.alarms.clear(POLLING_ALARM_NAME);
      return;
    }
    
    // Check if polling has been running too long (30 minutes max)
    const maxPollingTime = 30 * 60 * 1000; // 30 minutes
    if (data.pollingStartTime && (Date.now() - data.pollingStartTime > maxPollingTime)) {
      console.log('[Polling] Polling timeout reached, stopping');
      await stopSessionPolling(data.activePollingSession);
      notifySidePanel({ type: 'SESSION_EXPIRED', sessionId: data.activePollingSession });
      return;
    }
    
    // Poll for images
    await pollSessionForImages(data.activePollingSession);
  }
});

/**
 * Actually poll the server for images
 */
async function pollSessionForImages(sessionId) {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;

    // First, try to flush any previously failed images from the local buffer
    await flushPendingImageBuffer();

    // Check session status and get any pending images
    const statusUrl = `${serverUrl}/api/sessions/${sessionId}`;
    console.log(`[Polling] Checking session: ${statusUrl}`);

    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

    console.log(`[Polling] Status response: ${response.status}`);

    if (!response.ok) {
      // Session expired or not found
      console.log(`[Polling] Session ${sessionId} no longer valid (status ${response.status}), stopping`);
      await stopSessionPolling(sessionId);
      notifySidePanel({ type: 'SESSION_EXPIRED', sessionId });
      return;
    }

    const status = await response.json();
    console.log(`[Polling] Session status:`, JSON.stringify(status));

    // If there are images, fetch and relay them
    if (status.imageCount > 0) {
      console.log(`[Polling] Found ${status.imageCount} images, fetching...`);

      // Fetch images from a dedicated endpoint
      const imagesUrl = `${serverUrl}/api/sessions/${sessionId}/images`;

      const imagesResponse = await fetch(imagesUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      console.log(`[Polling] Images response: ${imagesResponse.status}`);

      if (imagesResponse.ok) {
        const data = await imagesResponse.json();
        console.log(`[Polling] Received ${data.images?.length || 0} images from server`);

        const images = data.images || [];

        // Send each image to the side panel with retry logic
        for (let i = 0; i < images.length; i++) {
          const imageData = images[i];
          console.log(`[Polling] Relaying image ${i + 1}/${images.length} to side panel`);

          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }

          // Await delivery — if it fails, the image is stored in the local buffer
          await notifySidePanelWithRetry({
            type: 'IMAGE_RECEIVED',
            imageData,
            sessionId
          });
        }

        if (images.length > 0) {
          console.log(`[Polling] Finished relaying ${images.length} image(s)`);
        }
      } else {
        console.error(`[Polling] Failed to fetch images: ${imagesResponse.status}`);
      }
    }

  } catch (error) {
    console.error(`[Polling] Error:`, error.message);
  }
}

/**
 * Flush the local fallback buffer of images that failed to deliver previously.
 * Called at the start of each poll cycle.
 */
async function flushPendingImageBuffer() {
  try {
    const data = await chrome.storage.local.get('pendingImageBuffer');
    const buffer = data.pendingImageBuffer || [];

    if (buffer.length === 0) return;

    console.log(`[Background] Flushing ${buffer.length} pending image(s) from buffer`);

    const stillPending = [];

    for (const entry of buffer) {
      // Discard entries older than 10 minutes (session likely expired)
      if (Date.now() - entry.storedAt > 10 * 60 * 1000) {
        console.log('[Background] Discarding expired buffered image');
        continue;
      }

      const delivered = await notifySidePanelWithRetry({
        type: 'IMAGE_RECEIVED',
        imageData: entry.imageData,
        sessionId: entry.sessionId
      }, 1); // Single attempt during flush — don't block polling

      if (!delivered) {
        stillPending.push(entry);
      }
    }

    // Update buffer with whatever is still undelivered
    await chrome.storage.local.set({ pendingImageBuffer: stillPending });

    if (stillPending.length > 0) {
      console.log(`[Background] ${stillPending.length} image(s) still pending delivery`);
    }

  } catch (error) {
    console.error('[Background] Error flushing pending buffer:', error);
  }
}

// ============================================================================
// OCR OPERATIONS
// ============================================================================

/**
 * Send image to server for OCR processing
 */
async function processOCR(imageData) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 3000; // 3 second base delay

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const settings = await chrome.storage.local.get('settings');
      const serverUrl = settings.settings?.serverUrl || SERVER_URL;

      const response = await fetch(`${serverUrl}/api/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * attempt;
          console.log(`[OCR] Rate limited (429), retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw new Error('Rate limit exceeded after retries');
      }

      if (!response.ok) {
        throw new Error(`OCR error: ${response.status}`);
      }

      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      console.error(`OCR processing failed (attempt ${attempt}):`, error);
      if (attempt === MAX_RETRIES) {
        return { success: false, error: error.message };
      }
    }
  }

  return { success: false, error: 'OCR failed after all retries' };
}

// ============================================================================
// FIELD MAPPING OPERATIONS
// ============================================================================

/**
 * Get field mapping for a URL from the server
 */
async function getFieldMapping(url) {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/mappings?url=${encodeURIComponent(url)}`);
    
    if (response.status === 404) {
      return { success: true, mapping: null };
    }
    
    if (!response.ok) {
      throw new Error(`Mapping fetch error: ${response.status}`);
    }
    
    const mapping = await response.json();
    return { success: true, mapping };
  } catch (error) {
    console.error('Failed to fetch mapping:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// EXCEL TEMPLATE FUNCTIONS
// ============================================================================

/**
 * Check if an Excel template exists for the given URL
 * Returns template info if found
 */
async function checkExcelTemplate(url) {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/excel/generate?url=${encodeURIComponent(url)}`);
    
    if (!response.ok) {
      throw new Error(`Template check error: ${response.status}`);
    }
    
    const result = await response.json();
    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to check Excel template:', error);
    return { success: false, hasTemplate: false, error: error.message };
  }
}

/**
 * Generate and download an Excel file
 * Returns the generated file as a base64 data URL (blobs can't be passed through messaging)
 */
async function generateExcel(templateId, data) {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/excel/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId,
        travelers: data.travelers || [],
        captain: data.captain || null,
        crew: data.crew || [],
        boat: data.boat || null,
        trip: data.trip || null
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Generate error: ${response.status}`);
    }
    
    // Get the filename from Content-Disposition header
    const disposition = response.headers.get('Content-Disposition');
    let filename = 'download.xlsx';
    if (disposition) {
      const match = disposition.match(/filename="?([^";\n]+)"?/);
      if (match) filename = match[1];
    }
    
    // Convert response to blob, then to base64 (blobs can't be passed through Chrome messaging)
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    return { 
      success: true, 
      base64, 
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
  } catch (error) {
    console.error('Failed to generate Excel:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// CONTENT SCRIPT COMMUNICATION
// ============================================================================

/**
 * Send fill command to content script
 * Injects content script if not already loaded on the page
 */
async function fillFormFields(tabId, data, mapping) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'FILL_FIELDS',
      data,
      mapping
    });
    return response;
  } catch (error) {
    // Content script not loaded - inject it first
    console.log('Content script not loaded, injecting for form fill...');
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content-script.js']
      });
      
      // Wait a moment for script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Retry sending the message
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'FILL_FIELDS',
        data,
        mapping
      });
      return response;
    } catch (injectError) {
      console.error('Failed to inject and fill form:', injectError);
      return { success: false, error: injectError.message };
    }
  }
}

/**
 * Set autopaste value on the active tab's content script
 */
async function setAutoPasteOnTab(value) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return { success: false, error: 'No active tab' };

    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_AUTOPASTE', value });
      return { success: true };
    } catch (error) {
      // Content script not loaded - inject it first
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.js']
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      await chrome.tabs.sendMessage(tab.id, { type: 'SET_AUTOPASTE', value });
      return { success: true };
    }
  } catch (error) {
    console.error('Failed to set autopaste:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get the currently active tab
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { success: true, tab };
}

/**
 * Scan form fields on a specific tab
 * Injects content script if not already loaded
 */
async function scanFieldsOnTab(tabId) {
  try {
    // First try to send message directly
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'SCAN_FORM_FIELDS'
    });
    return response;
  } catch (error) {
    // Content script not loaded - inject it first
    console.log('Content script not loaded, injecting for field scan...');
    
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content-script.js']
      });
      
      // Wait a moment for script to initialize
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Retry sending the message
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'SCAN_FORM_FIELDS'
      });
      return response;
    } catch (injectError) {
      console.error('Failed to inject and scan fields:', injectError);
      return { success: false, error: injectError.message };
    }
  }
}

// ============================================================================
// IMAGE OVERLAY FUNCTIONS
// ============================================================================

/**
 * Show image overlay on the active tab
 * Injects content script if needed, then sends the image data
 */
async function showImageOverlayOnTab(imageData) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      return { success: false, error: 'No active tab found' };
    }
    
    // Check if we can inject into this tab (not chrome:// or extension pages)
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      console.log('Cannot inject into this page:', tab.url);
      return { success: false, error: 'Cannot display overlay on this page type' };
    }
    
    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_IMAGE_OVERLAY',
        imageData: imageData
      });
      return { success: true };
    } catch (error) {
      // Content script not loaded - inject it first
      console.log('Content script not loaded, injecting...');
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content-script.js']
      });
      
      // Wait a moment for script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Try again
      await chrome.tabs.sendMessage(tab.id, {
        type: 'SHOW_IMAGE_OVERLAY',
        imageData: imageData
      });
      
      return { success: true };
    }
  } catch (error) {
    console.error('Failed to show image overlay:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Hide image overlay on the active tab
 */
async function hideImageOverlayOnTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab?.id) {
      return { success: true }; // No tab, nothing to hide
    }
    
    // Try to send message - if content script isn't loaded, that's fine
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'HIDE_IMAGE_OVERLAY'
      });
    } catch (error) {
      // Content script not loaded - nothing to hide
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to hide image overlay:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send message to side panel with retry logic.
 * For IMAGE_RECEIVED messages, stores failed deliveries in chrome.storage.local
 * so they can be recovered on the next successful poll.
 *
 * Returns true if delivered, false if stored for later retry.
 */
async function notifySidePanelWithRetry(message, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await chrome.runtime.sendMessage(message);
      console.log(`[Background] Message delivered: ${message.type} (attempt ${attempt})`);
      return true;
    } catch (error) {
      console.log(`[Background] Send attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 300 * attempt));
      }
    }
  }

  // All retries failed — store IMAGE_RECEIVED messages for later delivery
  if (message.type === 'IMAGE_RECEIVED' && message.imageData) {
    console.log('[Background] Storing undelivered image in local fallback buffer');
    try {
      const data = await chrome.storage.local.get('pendingImageBuffer');
      const buffer = data.pendingImageBuffer || [];
      buffer.push({
        imageData: message.imageData,
        sessionId: message.sessionId,
        storedAt: Date.now()
      });
      await chrome.storage.local.set({ pendingImageBuffer: buffer });
      console.log(`[Background] Stored image in buffer (${buffer.length} pending)`);
    } catch (storageError) {
      console.error('[Background] CRITICAL: Failed to store image in fallback buffer:', storageError);
    }
  }

  return false;
}

/**
 * Send message to side panel (fire-and-forget for non-critical messages).
 * IMAGE_RECEIVED messages use the retry version for reliability.
 */
function notifySidePanel(message) {
  if (message.type === 'IMAGE_RECEIVED') {
    // Use the retry version for images — these are the critical path
    notifySidePanelWithRetry(message);
  } else {
    // Non-critical messages: fire and forget
    chrome.runtime.sendMessage(message).catch(() => {});
  }
}

// ============================================================================
// CONTEXT MENU (optional - for quick access)
// ============================================================================

// Can be expanded later for right-click menu options

console.log('CrewForms service worker initialized');

