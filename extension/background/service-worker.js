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
    
    // Content script communication
    case 'FILL_FORM':
      return await fillFormFields(message.tabId, message.data, message.mapping);
    
    // Utility
    case 'GET_ACTIVE_TAB':
      return await getActiveTab();
    
    default:
      throw new Error(`Unknown message type: ${message.type}`);
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

// Active polling intervals (keyed by sessionId)
const activePollers = new Map();

/**
 * Start polling a session for uploaded images
 */
async function startSessionPolling(sessionId) {
  // Don't start if already polling
  if (activePollers.has(sessionId)) {
    return { success: true, message: 'Already polling' };
  }
  
  const settings = await chrome.storage.local.get('settings');
  const serverUrl = settings.settings?.serverUrl || SERVER_URL;
  
  console.log(`Starting to poll session ${sessionId} for images`);
  
  // Poll every 2 seconds
  const intervalId = setInterval(async () => {
    try {
      // Check session status and get any pending images
      const response = await fetch(`${serverUrl}/api/sessions/${sessionId}`);
      
      if (!response.ok) {
        // Session expired or not found
        console.log(`Session ${sessionId} no longer valid, stopping polling`);
        stopSessionPolling(sessionId);
        notifySidePanel({ type: 'SESSION_EXPIRED', sessionId });
        return;
      }
      
      const status = await response.json();
      
      // If there are images, fetch and relay them
      if (status.imageCount > 0) {
        console.log(`Found ${status.imageCount} images in session ${sessionId}`);
        
        // Fetch images from a dedicated endpoint
        const imagesResponse = await fetch(`${serverUrl}/api/sessions/${sessionId}/images`);
        
        if (imagesResponse.ok) {
          const { images } = await imagesResponse.json();
          
          // Send each image to the side panel
          for (const imageData of images) {
            console.log('Relaying image to side panel');
            notifySidePanel({ 
              type: 'IMAGE_RECEIVED', 
              imageData,
              sessionId 
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 2000);
  
  activePollers.set(sessionId, intervalId);
  
  return { success: true };
}

/**
 * Stop polling a session
 */
function stopSessionPolling(sessionId) {
  const intervalId = activePollers.get(sessionId);
  if (intervalId) {
    clearInterval(intervalId);
    activePollers.delete(sessionId);
    console.log(`Stopped polling session ${sessionId}`);
  }
  return { success: true };
}

// ============================================================================
// OCR OPERATIONS
// ============================================================================

/**
 * Send image to server for OCR processing
 */
async function processOCR(imageData) {
  try {
    const settings = await chrome.storage.local.get('settings');
    const serverUrl = settings.settings?.serverUrl || SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageData })
    });
    
    if (!response.ok) {
      throw new Error(`OCR error: ${response.status}`);
    }
    
    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('OCR processing failed:', error);
    return { success: false, error: error.message };
  }
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
// CONTENT SCRIPT COMMUNICATION
// ============================================================================

/**
 * Send fill command to content script
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
    console.error('Failed to fill form:', error);
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
 * Send message to side panel
 */
function notifySidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be open - ignore error
  });
}

// ============================================================================
// CONTEXT MENU (optional - for quick access)
// ============================================================================

// Can be expanded later for right-click menu options

console.log('CrewForms service worker initialized');

