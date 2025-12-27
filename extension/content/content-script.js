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
// INITIALIZE
// ============================================================================

initialize();

