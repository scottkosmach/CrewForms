/**
 * CrewForms Content Script
 * 
 * Runs on all pages to:
 * - Detect form fields
 * - Track currently focused field
 * - Execute form filling commands from side panel
 * - Handle various input types (text, select, date, radio, checkbox)
 */

// ============================================================================
// STATE
// ============================================================================

// Track the currently focused element
let focusedElement = null;

// Current field mapping for this page (if any)
let currentMapping = null;

// Image overlay state
let imageOverlay = null;
let overlayState = {
  rotation: 0,      // Current rotation in degrees (0, 90, 180, 270)
  zoom: 1,          // Current zoom level (1x to 5x)
  isPanning: false, // Currently panning the image
  panStart: { x: 0, y: 0 },
  panOffset: { x: 0, y: 0 }
};

// Store references to event handlers for cleanup
let overlayEventHandlers = {
  mousemove: null,
  mouseup: null,
  keydown: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize content script
 */
function initialize() {
  console.log('CrewForms content script loaded on:', window.location.href);
  
  // Track focus changes
  document.addEventListener('focusin', handleFocusIn);
  document.addEventListener('focusout', handleFocusOut);
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Notify background that content script is ready
  notifyReady();
}

/**
 * Notify background script that content script is ready
 */
function notifyReady() {
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    url: window.location.href
  }).catch(() => {
    // Background might not be listening yet
  });
}

// ============================================================================
// FOCUS TRACKING
// ============================================================================

/**
 * Handle focus entering an element
 */
function handleFocusIn(event) {
  const element = event.target;
  
  // Only track form input elements
  if (isFormElement(element)) {
    focusedElement = element;
    
    // Notify side panel of focus change
    chrome.runtime.sendMessage({
      type: 'FOCUS_CHANGED',
      elementInfo: getElementInfo(element)
    }).catch(() => {});
  }
}

/**
 * Handle focus leaving an element
 */
function handleFocusOut(event) {
  // Small delay to allow for focus moving to another element
  setTimeout(() => {
    if (document.activeElement === document.body) {
      focusedElement = null;
    }
  }, 100);
}

/**
 * Check if element is a form input we should track
 */
function isFormElement(element) {
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea' ||
    element.isContentEditable
  );
}

/**
 * Get information about an element for the side panel
 */
function getElementInfo(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    type: element.type || null,
    name: element.name || null,
    id: element.id || null,
    placeholder: element.placeholder || null,
    value: element.value || null
  };
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Handle messages from background script
 */
function handleMessage(message, sender, sendResponse) {
  console.log('Content script received:', message.type);
  
  switch (message.type) {
    case 'FILL_FIELDS':
      handleFillFields(message.data, message.mapping)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
    
    case 'GET_FOCUSED_ELEMENT':
      sendResponse({
        success: true,
        element: focusedElement ? getElementInfo(focusedElement) : null
      });
      break;
    
    case 'GET_FORM_FIELDS':
      sendResponse({
        success: true,
        fields: getFormFields()
      });
      break;
    
    case 'SET_MAPPING':
      currentMapping = message.mapping;
      sendResponse({ success: true });
      break;
    
    case 'SHOW_IMAGE_OVERLAY':
      showImageOverlay(message.imageData);
      sendResponse({ success: true });
      break;
    
    case 'HIDE_IMAGE_OVERLAY':
      hideImageOverlay();
      sendResponse({ success: true });
      break;
    
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
}

// ============================================================================
// FORM FIELD DETECTION
// ============================================================================

/**
 * Get all form fields on the page
 */
function getFormFields() {
  const fields = [];
  const elements = document.querySelectorAll('input, select, textarea');
  
  elements.forEach((element, index) => {
    fields.push({
      index,
      ...getElementInfo(element),
      visible: isElementVisible(element)
    });
  });
  
  return fields;
}

/**
 * Check if an element is visible
 */
function isElementVisible(element) {
  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  );
}

// ============================================================================
// FORM FILLING
// ============================================================================

/**
 * Fill form fields based on data and mapping
 */
async function handleFillFields(data, mapping) {
  if (!focusedElement) {
    return { success: false, error: 'No field is currently focused' };
  }
  
  if (!mapping || !mapping.fields) {
    return { success: false, error: 'No field mapping provided' };
  }
  
  try {
    // Find the form block starting from focused element
    const formBlock = findFormBlock(focusedElement);
    const fields = formBlock.querySelectorAll('input, select, textarea');
    
    let filledCount = 0;
    
    // Fill each mapped field
    for (const fieldMapping of mapping.fields) {
      const fieldIndex = fieldMapping.position - 1; // Convert 1-based to 0-based
      
      if (fieldIndex >= 0 && fieldIndex < fields.length) {
        const field = fields[fieldIndex];
        const value = getValueFromData(data, fieldMapping.dataSource);
        
        if (value !== undefined && value !== null) {
          await fillField(field, value, fieldMapping);
          filledCount++;
        }
      }
    }
    
    return { success: true, filledCount };
  } catch (error) {
    console.error('Error filling fields:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Find the form block containing an element
 * This handles dynamic forms with repeatable guest blocks
 */
function findFormBlock(element) {
  // Look for common form block patterns
  // Try to find a parent container that groups related fields
  
  let current = element.parentElement;
  
  while (current && current !== document.body) {
    // Check for common block identifiers
    const classList = current.classList.toString().toLowerCase();
    const id = (current.id || '').toLowerCase();
    
    if (
      classList.includes('guest') ||
      classList.includes('passenger') ||
      classList.includes('traveler') ||
      classList.includes('person') ||
      classList.includes('block') ||
      classList.includes('row') ||
      classList.includes('entry') ||
      id.includes('guest') ||
      id.includes('passenger')
    ) {
      return current;
    }
    
    // Also check if this is a form element
    if (current.tagName.toLowerCase() === 'form') {
      return current;
    }
    
    current = current.parentElement;
  }
  
  // Fallback: return the form or document body
  return element.closest('form') || document.body;
}

/**
 * Get a value from nested data using dot notation
 * e.g., 'traveler.dateOfBirth.month' -> data.traveler.dateOfBirth.month
 */
function getValueFromData(data, dataSource) {
  const parts = dataSource.split('.');
  let value = data;
  
  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[part];
  }
  
  return value;
}

/**
 * Fill a single field based on its input type
 */
async function fillField(field, value, mapping) {
  const inputType = mapping.inputType || 'text';
  
  switch (inputType) {
    case 'text':
      await fillTextField(field, value);
      break;
    
    case 'select-match':
      await fillSelectMatch(field, value);
      break;
    
    case 'select-keypress':
      await fillSelectKeypress(field, value, mapping.config);
      break;
    
    case 'date-text':
      await fillDateText(field, value, mapping.config);
      break;
    
    case 'date-dropdowns':
      // This is handled at the mapping level - each dropdown is a separate field
      await fillSelectMatch(field, value);
      break;
    
    case 'date-picker':
      await fillDatePicker(field, value, mapping.config);
      break;
    
    case 'radio':
      await fillRadio(field, value);
      break;
    
    case 'checkbox':
      await fillCheckbox(field, value);
      break;
    
    default:
      await fillTextField(field, value);
  }
}

// ============================================================================
// INPUT TYPE HANDLERS
// ============================================================================

/**
 * Fill a text input field
 */
async function fillTextField(field, value) {
  // Clear existing value
  field.value = '';
  
  // Set new value
  field.value = String(value);
  
  // Trigger events to notify any listeners
  triggerInputEvents(field);
}

/**
 * Fill a select dropdown by matching option text or value
 */
async function fillSelectMatch(field, value) {
  const options = field.options;
  const searchValue = String(value).toLowerCase();
  
  // Try to find matching option
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const optionText = option.text.toLowerCase();
    const optionValue = option.value.toLowerCase();
    
    if (optionText === searchValue || 
        optionValue === searchValue ||
        optionText.includes(searchValue) ||
        optionValue.includes(searchValue)) {
      field.selectedIndex = i;
      triggerInputEvents(field);
      return;
    }
  }
  
  console.warn(`No matching option found for: ${value}`);
}

/**
 * Fill a select dropdown using keypress navigation
 */
async function fillSelectKeypress(field, value, config) {
  if (!config || !config.keypressMap) {
    // Fallback to match method
    return fillSelectMatch(field, value);
  }
  
  const keypressConfig = config.keypressMap[value];
  
  if (!keypressConfig) {
    // Value not in keypress map, try match
    return fillSelectMatch(field, value);
  }
  
  // Focus the select
  field.focus();
  
  // Simulate keypresses
  const { key, count } = keypressConfig;
  
  for (let i = 0; i < count; i++) {
    await simulateKeypress(field, key);
    await sleep(50); // Small delay between keypresses
  }
  
  triggerInputEvents(field);
}

/**
 * Fill a date field as text
 */
async function fillDateText(field, value, config) {
  // Value should be an object with day, month, year or a date string
  let formattedDate;
  
  if (typeof value === 'object' && value.day && value.month && value.year) {
    // Format based on config
    const format = config?.format || 'MM/DD/YYYY';
    formattedDate = formatDate(value, format);
  } else {
    formattedDate = String(value);
  }
  
  await fillTextField(field, formattedDate);
}

/**
 * Fill a date picker widget
 */
async function fillDatePicker(field, value, config) {
  // This is complex and site-specific
  // For now, try to set the value directly
  if (typeof value === 'object' && value.day && value.month && value.year) {
    const isoDate = `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
    field.value = isoDate;
  } else {
    field.value = String(value);
  }
  
  triggerInputEvents(field);
}

/**
 * Fill a radio button group
 */
async function fillRadio(field, value) {
  // Find the radio button with matching value
  const name = field.name;
  const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
  
  for (const radio of radios) {
    if (radio.value.toLowerCase() === String(value).toLowerCase()) {
      radio.checked = true;
      triggerInputEvents(radio);
      return;
    }
  }
}

/**
 * Fill a checkbox
 */
async function fillCheckbox(field, value) {
  const shouldCheck = value === true || value === 'true' || value === 1 || value === '1';
  
  if (field.checked !== shouldCheck) {
    field.checked = shouldCheck;
    triggerInputEvents(field);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format a date object to a string
 */
function formatDate(dateObj, format) {
  const day = String(dateObj.day).padStart(2, '0');
  const month = String(dateObj.month).padStart(2, '0');
  const year = String(dateObj.year);
  
  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year)
    .replace('YY', year.slice(-2));
}

/**
 * Trigger input events on a field
 */
function triggerInputEvents(field) {
  // Dispatch events that forms typically listen for
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Simulate a keypress on an element
 */
async function simulateKeypress(element, key) {
  const keydownEvent = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true
  });
  
  const keypressEvent = new KeyboardEvent('keypress', {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true
  });
  
  const keyupEvent = new KeyboardEvent('keyup', {
    key,
    code: `Key${key.toUpperCase()}`,
    bubbles: true
  });
  
  element.dispatchEvent(keydownEvent);
  element.dispatchEvent(keypressEvent);
  element.dispatchEvent(keyupEvent);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// IMAGE OVERLAY
// ============================================================================

/**
 * Inject overlay styles into the page
 */
function injectOverlayStyles() {
  if (document.getElementById('crewforms-overlay-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'crewforms-overlay-styles';
  styles.textContent = `
    #crewforms-image-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    
    #crewforms-image-container {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
      cursor: grab;
    }
    
    #crewforms-image-container.panning {
      cursor: grabbing;
    }
    
    #crewforms-passport-image {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      transition: transform 0.2s ease;
      user-select: none;
      -webkit-user-drag: none;
    }
    
    #crewforms-overlay-controls {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(30, 58, 95, 0.95);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      z-index: 2147483647;
    }
    
    .crewforms-overlay-btn {
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 18px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, transform 0.1s;
    }
    
    .crewforms-overlay-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }
    
    .crewforms-overlay-btn:active {
      transform: scale(0.95);
    }
    
    #crewforms-zoom-display {
      min-width: 50px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 0 8px;
    }
    
    #crewforms-close-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      border: none;
      border-radius: 50%;
      background: rgba(239, 68, 68, 0.9);
      color: white;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      transition: background 0.2s, transform 0.1s;
    }
    
    #crewforms-close-overlay:hover {
      background: rgba(220, 38, 38, 1);
      transform: scale(1.05);
    }
    
    #crewforms-overlay-hint {
      position: fixed;
      top: 20px;
      left: 20px;
      padding: 10px 16px;
      background: rgba(30, 58, 95, 0.9);
      color: white;
      border-radius: 8px;
      font-size: 13px;
      z-index: 2147483647;
    }
  `;
  document.head.appendChild(styles);
}

/**
 * Show the image overlay with passport image
 */
function showImageOverlay(imageData) {
  // Remove existing overlay if present
  hideImageOverlay();
  
  // Inject styles
  injectOverlayStyles();
  
  // Reset state
  overlayState = {
    rotation: 0,
    zoom: 1,
    isPanning: false,
    panStart: { x: 0, y: 0 },
    panOffset: { x: 0, y: 0 }
  };
  
  // Create overlay container
  imageOverlay = document.createElement('div');
  imageOverlay.id = 'crewforms-image-overlay';
  
  imageOverlay.innerHTML = `
    <div id="crewforms-image-container">
      <img id="crewforms-passport-image" src="${imageData}" alt="Passport" draggable="false">
    </div>
    
    <div id="crewforms-overlay-hint">
      Scroll to zoom • Drag to pan when zoomed
    </div>
    
    <div id="crewforms-overlay-controls">
      <button class="crewforms-overlay-btn" id="crewforms-rotate-left" title="Rotate Left">↺</button>
      <button class="crewforms-overlay-btn" id="crewforms-rotate-right" title="Rotate Right">↻</button>
      <button class="crewforms-overlay-btn" id="crewforms-zoom-out" title="Zoom Out">−</button>
      <span id="crewforms-zoom-display">1x</span>
      <button class="crewforms-overlay-btn" id="crewforms-zoom-in" title="Zoom In">+</button>
      <button class="crewforms-overlay-btn" id="crewforms-zoom-reset" title="Reset">⟲</button>
    </div>
    
    <button id="crewforms-close-overlay" title="Close">×</button>
  `;
  
  document.body.appendChild(imageOverlay);
  
  // Set up event listeners
  setupOverlayEventListeners();
  
  console.log('CrewForms: Image overlay shown');
}

/**
 * Hide and remove the image overlay
 */
function hideImageOverlay() {
  // Always clean up document-level event listeners (even if overlay is null)
  // This prevents listener accumulation if something goes wrong
  if (overlayEventHandlers.mousemove) {
    document.removeEventListener('mousemove', overlayEventHandlers.mousemove);
    overlayEventHandlers.mousemove = null;
  }
  if (overlayEventHandlers.mouseup) {
    document.removeEventListener('mouseup', overlayEventHandlers.mouseup);
    overlayEventHandlers.mouseup = null;
  }
  if (overlayEventHandlers.keydown) {
    document.removeEventListener('keydown', overlayEventHandlers.keydown);
    overlayEventHandlers.keydown = null;
  }
  
  // Remove the overlay DOM element
  if (imageOverlay) {
    imageOverlay.remove();
    imageOverlay = null;
    console.log('CrewForms: Image overlay hidden');
  }
}

/**
 * Set up all event listeners for the overlay
 */
function setupOverlayEventListeners() {
  const container = document.getElementById('crewforms-image-container');
  const image = document.getElementById('crewforms-passport-image');
  
  // Close button
  document.getElementById('crewforms-close-overlay').addEventListener('click', () => {
    hideImageOverlay();
    // Notify side panel that overlay was closed
    chrome.runtime.sendMessage({ type: 'IMAGE_OVERLAY_CLOSED' }).catch(() => {});
  });
  
  // Rotation buttons
  // Note: We don't use modulo (% 360) to avoid CSS animation jumping backwards
  // CSS handles rotation values > 360° fine, and this ensures smooth animation
  document.getElementById('crewforms-rotate-left').addEventListener('click', () => {
    overlayState.rotation -= 90;
    updateImageTransform();
  });
  
  document.getElementById('crewforms-rotate-right').addEventListener('click', () => {
    overlayState.rotation += 90;
    updateImageTransform();
  });
  
  // Zoom buttons
  document.getElementById('crewforms-zoom-in').addEventListener('click', () => {
    overlayState.zoom = Math.min(5, overlayState.zoom + 0.5);
    updateImageTransform();
    updateZoomDisplay();
  });
  
  document.getElementById('crewforms-zoom-out').addEventListener('click', () => {
    overlayState.zoom = Math.max(0.5, overlayState.zoom - 0.5);
    updateImageTransform();
    updateZoomDisplay();
  });
  
  // Reset button
  document.getElementById('crewforms-zoom-reset').addEventListener('click', () => {
    overlayState.rotation = 0;
    overlayState.zoom = 1;
    overlayState.panOffset = { x: 0, y: 0 };
    updateImageTransform();
    updateZoomDisplay();
  });
  
  // Mouse wheel zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    overlayState.zoom = Math.max(0.5, Math.min(5, overlayState.zoom + delta));
    updateImageTransform();
    updateZoomDisplay();
  }, { passive: false });
  
  // Pan/drag functionality
  container.addEventListener('mousedown', (e) => {
    if (overlayState.zoom > 1) {
      overlayState.isPanning = true;
      overlayState.panStart = { x: e.clientX, y: e.clientY };
      container.classList.add('panning');
    }
  });
  
  // Store reference to mousemove handler for cleanup
  overlayEventHandlers.mousemove = (e) => {
    if (overlayState.isPanning) {
      // Calculate mouse movement in screen coordinates
      // No rotation adjustment needed because translate is applied in screen space
      // (see updateImageTransform - translate comes first in the transform string)
      const dx = e.clientX - overlayState.panStart.x;
      const dy = e.clientY - overlayState.panStart.y;
      
      overlayState.panOffset.x += dx;
      overlayState.panOffset.y += dy;
      overlayState.panStart = { x: e.clientX, y: e.clientY };
      updateImageTransform();
    }
  };
  document.addEventListener('mousemove', overlayEventHandlers.mousemove);
  
  // Store reference to mouseup handler for cleanup
  overlayEventHandlers.mouseup = () => {
    if (overlayState.isPanning) {
      overlayState.isPanning = false;
      const container = document.getElementById('crewforms-image-container');
      if (container) container.classList.remove('panning');
    }
  };
  document.addEventListener('mouseup', overlayEventHandlers.mouseup);
  
  // Store reference to keydown handler for cleanup
  overlayEventHandlers.keydown = handleOverlayKeydown;
  document.addEventListener('keydown', overlayEventHandlers.keydown);
}

/**
 * Handle keyboard shortcuts for overlay
 */
function handleOverlayKeydown(e) {
  if (!imageOverlay) return;
  
  switch (e.key) {
    case 'Escape':
      hideImageOverlay();
      chrome.runtime.sendMessage({ type: 'IMAGE_OVERLAY_CLOSED' }).catch(() => {});
      break;
    case 'r':
    case 'R':
      // Don't use modulo to avoid CSS animation jumping backwards
      overlayState.rotation += 90;
      updateImageTransform();
      break;
    case '+':
    case '=':
      overlayState.zoom = Math.min(5, overlayState.zoom + 0.5);
      updateImageTransform();
      updateZoomDisplay();
      break;
    case '-':
    case '_':
      overlayState.zoom = Math.max(0.5, overlayState.zoom - 0.5);
      updateImageTransform();
      updateZoomDisplay();
      break;
    case '0':
      overlayState.rotation = 0;
      overlayState.zoom = 1;
      overlayState.panOffset = { x: 0, y: 0 };
      updateImageTransform();
      updateZoomDisplay();
      break;
  }
}

/**
 * Update the image transform based on current state
 * 
 * Transform order (CSS applies right-to-left):
 * - scale is applied first (to the image)
 * - rotate is applied second (rotates the scaled image)  
 * - translate is applied last (in screen coordinates)
 * 
 * This order ensures panning works intuitively in screen space
 * regardless of the current rotation angle.
 */
function updateImageTransform() {
  const image = document.getElementById('crewforms-passport-image');
  if (!image) return;
  
  const { rotation, zoom, panOffset } = overlayState;
  // translate first in string = applied last = screen coordinates
  image.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) rotate(${rotation}deg) scale(${zoom})`;
}

/**
 * Update the zoom display text
 */
function updateZoomDisplay() {
  const display = document.getElementById('crewforms-zoom-display');
  if (display) {
    display.textContent = `${overlayState.zoom.toFixed(1)}x`;
  }
}

// ============================================================================
// INITIALIZE
// ============================================================================

initialize();

