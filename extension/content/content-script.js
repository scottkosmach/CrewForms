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
 * 
 * Note: We intentionally do NOT clear focusedElement when focus leaves
 * the page entirely (e.g., when clicking into the side panel).
 * We only update focusedElement when a NEW form element is focused.
 * This preserves the "last focused field" context for paste operations.
 */
function handleFocusOut(event) {
  // Don't clear focusedElement - we want to remember the last focused
  // form field even when focus moves to the side panel or elsewhere.
  // focusedElement will be updated when handleFocusIn fires on a new field.
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
    
    case 'SCAN_FORM_FIELDS':
      sendResponse({
        success: true,
        fields: scanAllFormFields()
      });
      break;
    
    case 'TEST_FILL_FIELD':
      handleTestFillField(message.position, message.value, message.config)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
    
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
// ADMIN MODE - FIELD SCANNING
// ============================================================================

/**
 * Scan all form fields on the page for admin mapping assistant
 * Returns detailed info about each field including position, type, and label
 */
function scanAllFormFields() {
  const form = document.querySelector('form') || document.body;
  
  // Extended selector to include Angular Material and custom dropdowns
  const elements = form.querySelectorAll(
    'input, select, textarea, mat-select, [role="combobox"], [role="listbox"]'
  );
  
  return Array.from(elements).map((el, index) => ({
    position: index + 1,
    tagName: el.tagName.toLowerCase(),
    type: el.type || el.getAttribute('role') || 'unknown',
    id: el.id || null,
    name: el.name || null,
    formControlName: el.getAttribute('formcontrolname') || null,
    placeholder: el.placeholder || null,
    label: findLabelFor(el),
    isRequired: el.required || el.getAttribute('aria-required') === 'true',
    isDisabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
    classes: el.className,
    visible: isElementVisible(el)
  }));
}

/**
 * Find the label text associated with a form element
 * Checks multiple common patterns used in forms
 */
function findLabelFor(element) {
  // 1. Check for label with matching 'for' attribute
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) return label.textContent.trim().replace(/\*$/, '').trim();
  }
  
  // 2. Check aria-label attribute
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  
  // 3. Check aria-labelledby attribute
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelEl = document.getElementById(ariaLabelledBy);
    if (labelEl) return labelEl.textContent.trim().replace(/\*$/, '').trim();
  }
  
  // 4. Check for parent label element (wrapping pattern)
  const parentLabel = element.closest('label');
  if (parentLabel) {
    // Get text content but exclude the input's own content
    const clone = parentLabel.cloneNode(true);
    const inputs = clone.querySelectorAll('input, select, textarea');
    inputs.forEach(i => i.remove());
    const text = clone.textContent.trim().replace(/\*$/, '').trim();
    if (text) return text;
  }
  
  // 5. Check for Angular Material mat-label
  const formField = element.closest('mat-form-field, .mat-form-field');
  if (formField) {
    const matLabel = formField.querySelector('mat-label');
    if (matLabel) return matLabel.textContent.trim().replace(/\*$/, '').trim();
  }
  
  // 6. Check for Bootstrap/common form-group pattern
  const formGroup = element.closest('.form-group, .form-row');
  if (formGroup) {
    const label = formGroup.querySelector('label, .control-label, .form-label');
    if (label) return label.textContent.trim().replace(/\*$/, '').trim();
  }
  
  // 7. Check previous sibling for label
  let prevSibling = element.previousElementSibling;
  while (prevSibling) {
    if (prevSibling.tagName === 'LABEL' || prevSibling.classList.contains('label')) {
      return prevSibling.textContent.trim().replace(/\*$/, '').trim();
    }
    prevSibling = prevSibling.previousElementSibling;
  }
  
  // 8. Use placeholder as fallback
  if (element.placeholder && element.placeholder !== '--Select--') {
    return element.placeholder;
  }
  
  // 9. Use name attribute as last resort
  if (element.name) {
    // Convert camelCase or snake_case to readable text
    return element.name
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .replace(/^\w/, c => c.toUpperCase());
  }
  
  return null;
}

// ============================================================================
// FORM FILLING
// ============================================================================

/**
 * Fill form fields based on data and mapping
 * 
 * Added delay between fields to allow Angular/React forms to process changes.
 * Default delay is 100ms but can be configured via mapping.fillDelay
 */
async function handleFillFields(data, mapping) {
  console.log('[CrewForms] handleFillFields called');
  console.log('[CrewForms] Data received:', JSON.stringify(data, null, 2));
  console.log('[CrewForms] Mapping fields count:', mapping?.fields?.length);
  
  if (!mapping || !mapping.fields) {
    console.error('[CrewForms] No field mapping provided');
    return { success: false, error: 'No field mapping provided' };
  }
  
  try {
    let formBlock;
    
    // For static forms, we don't need a focused element - just use the form directly
    // This allows pasting without clicking into a field first
    if (mapping.formType === 'static' || !mapping.formType) {
      formBlock = document.querySelector('form') || document.body;
      console.log('[CrewForms] Static form - using form directly:', formBlock.tagName);
    } else {
      // For dynamic-guest-blocks, we need a focused element to identify which guest block to fill
      if (!focusedElement) {
        console.error('[CrewForms] No field is currently focused');
        return { success: false, error: 'No field is currently focused. Click on a form field first.' };
      }
      formBlock = findFormBlock(focusedElement, mapping.formType);
      console.log('[CrewForms] Dynamic form block found:', formBlock.tagName, formBlock.className);
    }
    
    // Must match selector in scanAllFormFields() for consistent field positions!
    // Includes Angular Material mat-select and custom dropdown components.
    const fields = formBlock.querySelectorAll(
      'input, select, textarea, mat-select, [role="combobox"], [role="listbox"]'
    );
    console.log('[CrewForms] Total fields in form block:', fields.length);
    
    let filledCount = 0;
    const errors = [];
    const skipped = [];
    
    // Delay between field fills (default 100ms for Angular/React forms)
    // Can be configured per-mapping via mapping.fillDelay
    const fillDelay = mapping.fillDelay || 100;
    console.log('[CrewForms] Using fill delay:', fillDelay, 'ms');
    
    // Fill each mapped field
    for (const fieldMapping of mapping.fields) {
      const fieldIndex = fieldMapping.position - 1; // Convert 1-based to 0-based
      
      if (fieldIndex < 0 || fieldIndex >= fields.length) {
        const msg = `Field #${fieldMapping.position} not found (index ${fieldIndex}, total: ${fields.length})`;
        console.warn('[CrewForms]', msg);
        errors.push({ position: fieldMapping.position, error: msg });
        continue;
      }
      
      const field = fields[fieldIndex];
      
      // Get value based on field status (data vs static)
      let value;
      if (fieldMapping.status === 'static') {
        value = fieldMapping.staticValue;
        console.log(`[CrewForms] Field #${fieldMapping.position}: static value = "${value}"`);
      } else {
        value = getValueFromData(data, fieldMapping.dataSource);
        console.log(`[CrewForms] Field #${fieldMapping.position}: dataSource = "${fieldMapping.dataSource}", value = "${value}"`);
      }
      
      // For select-keypress with a configured keypressMap, we execute keystrokes even if value is empty
      // because the keystrokes themselves are the "value" (e.g., press 'p' then 'Enter' to select "Passenger")
      const hasKeypressConfig = fieldMapping.inputType === 'select-keypress' && 
                                fieldMapping.config?.keypressMap && 
                                Object.keys(fieldMapping.config.keypressMap).length > 0;
      
      if ((value === undefined || value === null || value === '') && !hasKeypressConfig) {
        const msg = `No value for field #${fieldMapping.position} (dataSource: ${fieldMapping.dataSource})`;
        console.log('[CrewForms]', msg);
        skipped.push({ position: fieldMapping.position, reason: 'empty value', dataSource: fieldMapping.dataSource });
        continue;
      }
      
      console.log(`[CrewForms] Field #${fieldMapping.position}: hasKeypressConfig=${hasKeypressConfig}`);
      
      try {
        // Fill the field
        await fillField(field, value, fieldMapping);
        filledCount++;
        console.log(`[CrewForms] ✓ Field #${fieldMapping.position} filled successfully`);
        
        // Add delay between fields to allow form frameworks to process changes
        // This is critical for Angular Material and other reactive frameworks
        if (fillDelay > 0) {
          await sleep(fillDelay);
        }
      } catch (fieldError) {
        const msg = `Error filling field #${fieldMapping.position}: ${fieldError.message}`;
        console.error('[CrewForms]', msg);
        errors.push({ position: fieldMapping.position, error: fieldError.message });
      }
    }
    
    console.log(`[CrewForms] Fill complete: ${filledCount}/${mapping.fields.length} fields filled`);
    if (skipped.length > 0) {
      console.log('[CrewForms] Skipped fields:', skipped);
    }
    if (errors.length > 0) {
      console.log('[CrewForms] Errors:', errors);
    }
    
    return { 
      success: true, 
      filledCount,
      totalMapped: mapping.fields.length,
      skipped: skipped.length,
      errors: errors.length > 0 ? errors : undefined
    };
  } catch (error) {
    console.error('[CrewForms] Error filling fields:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Test fill a single field by position (used by admin panel)
 * Unlike handleFillFields, this targets a specific field position directly
 * 
 * IMPORTANT: Must use the same selector as scanAllFormFields() to ensure
 * field positions match between scanning and testing. This includes
 * Angular Material mat-select and custom dropdown components.
 */
async function handleTestFillField(position, value, config) {
  try {
    // Find all form fields on the page
    // Must match selector in scanAllFormFields() for consistent field positions!
    const form = document.querySelector('form') || document.body;
    const fields = form.querySelectorAll(
      'input, select, textarea, mat-select, [role="combobox"], [role="listbox"]'
    );
    
    const fieldIndex = position - 1; // Convert 1-based to 0-based
    
    if (fieldIndex < 0 || fieldIndex >= fields.length) {
      return { success: false, error: `Field at position ${position} not found` };
    }
    
    const field = fields[fieldIndex];
    
    // Scroll field into view first
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300); // Wait for scroll
    
    const inputType = config.inputType || 'paste';
    
    // Handle keypress navigation specially - execute ALL keystrokes in sequence
    if (inputType === 'select-keypress' && config.keypressMap) {
      const keypressEntries = Object.entries(config.keypressMap);
      
      if (keypressEntries.length > 0) {
        // Focus the field first
        field.focus();
        field.click();
        await sleep(100);
        
        const delay = config.keypressDelay || 100; // Default 100ms if not specified
        
        // Execute ALL entries in sequence (each entry can have its own key and repeat count)
        for (const [entryLabel, keypressConfig] of keypressEntries) {
          const { key, count } = keypressConfig;
          
          // Execute this entry's keystrokes (repeat 'count' times)
          for (let i = 0; i < (count || 1); i++) {
            await simulateKeypress(field, key);
            await sleep(delay); // Configurable delay between keypresses
          }
        }
        
        triggerInputEvents(field);
      }
    } else {
      // Create a minimal mapping object for fillField
      const fieldMapping = {
        inputType,
        dateFormat: config.dateFormat,
        config: {
          keypressMap: config.keypressMap
        }
      };
      
      // Fill the field using standard method
      await fillField(field, value, fieldMapping);
    }
    
    // Highlight briefly
    const originalOutline = field.style.outline;
    field.style.outline = '3px solid #10b981';
    setTimeout(() => {
      field.style.outline = originalOutline;
    }, 2000);
    
    return { success: true };
  } catch (error) {
    console.error('Error testing field:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Find the form block containing an element
 * 
 * @param {HTMLElement} element - The element to start searching from
 * @param {string} formType - 'static' or 'dynamic-guest-blocks'
 * 
 * For static forms: Returns the whole <form> element (single-guest per form)
 * For dynamic-guest-blocks: Searches for guest-specific containers
 */
function findFormBlock(element, formType) {
  // For static (single-guest) forms, use the whole form
  // This is the most common case where one form = one guest
  if (formType === 'static') {
    return element.closest('form') || document.body;
  }
  
  // For dynamic guest blocks, look for guest-specific containers
  // These are repeating sections within a single form (e.g., Guest 1, Guest 2)
  let current = element.parentElement;
  
  while (current && current !== document.body) {
    const classList = current.classList.toString().toLowerCase();
    const id = (current.id || '').toLowerCase();
    
    // Only look for actual guest/passenger block indicators
    // NOT generic layout classes like "row" or "block" (used by Bootstrap, etc.)
    if (
      classList.includes('guest') ||
      classList.includes('passenger') ||
      classList.includes('traveler') ||
      classList.includes('person') ||
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
  const inputType = mapping.inputType || 'paste';
  
  // Format date if dateFormat is specified and value is an object with date parts
  if (mapping.dateFormat && typeof value === 'object' && (value.day || value.month || value.year)) {
    value = formatDateWithConfig(value, mapping.dateFormat);
  }
  
  switch (inputType) {
    case 'paste':
    case 'text':
      await fillTextField(field, value);
      break;
    
    case 'select-match':
      await fillSelectMatch(field, value);
      break;
    
    case 'select-keypress':
      await fillSelectKeypress(field, value, mapping.config);
      break;
    
    case 'click-select':
      await fillClickSelect(field, value, mapping.config);
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

/**
 * Format date object based on config format string
 * @param {Object} dateObj - Object with day, month, year properties
 * @param {string} format - Format string like 'DD/MM/YYYY', 'MM/DD/YYYY', etc.
 */
function formatDateWithConfig(dateObj, format) {
  const day = String(dateObj.day || '').padStart(2, '0');
  const month = String(dateObj.month || '').padStart(2, '0');
  const year = String(dateObj.year || '');
  
  return format
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year);
}

/**
 * Fill a dropdown using click-to-select approach
 * This handles custom dropdown components that require clicking to open
 */
async function fillClickSelect(field, value, config) {
  const delay = config?.openDelay || 100;
  const optionSelector = config?.optionSelector || '[role="option"], .option, li';
  
  // Click to open the dropdown
  field.click();
  field.focus();
  
  // Wait for dropdown to open
  await sleep(delay);
  
  // Look for the option to click
  const searchValue = String(value).toLowerCase();
  
  // Try to find options in a nearby dropdown container
  const dropdownContainer = document.querySelector(
    '.dropdown-menu, .mat-select-panel, .ng-dropdown-panel, [role="listbox"], .select-options'
  );
  
  if (dropdownContainer) {
    const options = dropdownContainer.querySelectorAll(optionSelector);
    
    for (const option of options) {
      const optionText = option.textContent.trim().toLowerCase();
      
      if (optionText === searchValue || optionText.includes(searchValue)) {
        option.click();
        await sleep(50);
        triggerInputEvents(field);
        return;
      }
    }
  }
  
  // Fallback: try match approach
  console.warn(`Click-select fallback for: ${value}`);
  await fillSelectMatch(field, value);
}

// ============================================================================
// INPUT TYPE HANDLERS
// ============================================================================

/**
 * Fill a text input field
 * 
 * Focuses the field first to ensure Angular/React forms recognize the change.
 * Uses a small delay after focus for framework change detection.
 */
async function fillTextField(field, value) {
  // Focus the field first - critical for Angular reactive forms
  field.focus();
  await sleep(10);
  
  // Clear existing value
  field.value = '';
  
  // Set new value
  field.value = String(value);
  
  // Trigger events to notify any listeners
  triggerInputEvents(field);
  
  // Small delay after events for framework processing
  await sleep(10);
}

/**
 * Fill a select dropdown by matching option text or value
 * 
 * Handles both native <select> elements and Angular Material mat-select.
 */
async function fillSelectMatch(field, value) {
  const searchValue = String(value).toLowerCase();
  console.log(`[CrewForms] fillSelectMatch: searching for "${value}"`);
  
  // Check if this is an Angular Material mat-select
  if (field.tagName.toLowerCase() === 'mat-select' || field.getAttribute('role') === 'combobox') {
    console.log('[CrewForms] Detected Angular Material mat-select');
    
    // Click to open the dropdown
    field.click();
    await sleep(200); // Wait for dropdown animation
    
    // Find the overlay panel with options
    const panel = document.querySelector('.mat-select-panel, .cdk-overlay-pane [role="listbox"]');
    if (panel) {
      const options = panel.querySelectorAll('mat-option, [role="option"]');
      console.log(`[CrewForms] Found ${options.length} options in mat-select panel`);
      
      for (const option of options) {
        const optionText = option.textContent.trim().toLowerCase();
        
        if (optionText === searchValue || optionText.includes(searchValue)) {
          console.log(`[CrewForms] Clicking option: "${option.textContent.trim()}"`);
          option.click();
          await sleep(50);
          triggerInputEvents(field);
          return;
        }
      }
      
      // If no match found, close the dropdown by pressing Escape
      await simulateKeypress(field, 'Escape');
      console.warn(`[CrewForms] No matching mat-option found for: ${value}`);
    } else {
      console.warn('[CrewForms] Could not find mat-select panel');
    }
    return;
  }
  
  // Native <select> element handling
  const options = field.options;
  if (!options) {
    console.warn('[CrewForms] Field has no options property');
    return;
  }
  
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
      console.log(`[CrewForms] Selected option: "${option.text}"`);
      return;
    }
  }
  
  console.warn(`[CrewForms] No matching option found for: ${value}`);
}

/**
 * Fill a select dropdown using keypress navigation
 * 
 * Supports two modes:
 * 1. Value-based: If value matches a key in keypressMap, play those keystrokes
 * 2. Sequence: If no value match, play ALL entries in order (for static sequences)
 */
async function fillSelectKeypress(field, value, config) {
  if (!config || !config.keypressMap) {
    // Fallback to match method
    return fillSelectMatch(field, value);
  }
  
  const delay = config.keypressDelay || 100; // Default 100ms if not specified
  const keypressEntries = Object.entries(config.keypressMap);
  
  // Check if value matches a specific entry
  const keypressConfig = config.keypressMap[value];
  
  // Focus the select
  field.focus();
  
  if (keypressConfig) {
    // Mode 1: Value-based - play keystrokes for this specific value
    const { key, count } = keypressConfig;
    
    for (let i = 0; i < count; i++) {
      await simulateKeypress(field, key);
      await sleep(delay);
    }
  } else if (keypressEntries.length > 0) {
    // Mode 2: Sequence - play ALL entries in order
    // This is used when the keypressMap is a sequence of steps, not a value lookup
    for (const [entryLabel, entryConfig] of keypressEntries) {
      const { key, count } = entryConfig;
      
      for (let i = 0; i < (count || 1); i++) {
        await simulateKeypress(field, key);
        await sleep(delay);
      }
    }
  } else {
    // No keypress config, try match method
    return fillSelectMatch(field, value);
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
 * Handles both regular keys (a-z) and special keys (Enter, Tab, Arrow keys, etc.)
 * 
 * Includes legacy keyCode/which properties for compatibility with older frameworks
 * and Angular Material components.
 */
async function simulateKeypress(element, key) {
  // Map special key names to their proper key/code/keyCode values
  // keyCode values are deprecated but still used by many frameworks
  const specialKeys = {
    'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
    'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
    'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
    'Space': { key: ' ', code: 'Space', keyCode: 32 },
    'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
    'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 }
  };
  
  // Determine key, code, and keyCode values
  let keyValue, codeValue, keyCodeValue;
  if (specialKeys[key]) {
    keyValue = specialKeys[key].key;
    codeValue = specialKeys[key].code;
    keyCodeValue = specialKeys[key].keyCode;
  } else {
    // Regular letter key
    keyValue = key;
    codeValue = `Key${key.toUpperCase()}`;
    keyCodeValue = key.toUpperCase().charCodeAt(0);
  }
  
  const eventOptions = {
    key: keyValue,
    code: codeValue,
    keyCode: keyCodeValue,
    which: keyCodeValue,
    charCode: keyCodeValue,
    bubbles: true,
    cancelable: true,
    composed: true,  // Allows event to cross shadow DOM boundaries
    view: window
  };
  
  // Dispatch keydown (most frameworks listen to this)
  const keydownEvent = new KeyboardEvent('keydown', eventOptions);
  element.dispatchEvent(keydownEvent);
  
  // Dispatch keypress (deprecated but some still use it) - not for special keys
  if (!specialKeys[key]) {
    const keypressEvent = new KeyboardEvent('keypress', eventOptions);
    element.dispatchEvent(keypressEvent);
  }
  
  // Dispatch keyup
  const keyupEvent = new KeyboardEvent('keyup', eventOptions);
  element.dispatchEvent(keyupEvent);
  
  // For Enter key specifically, also try dispatching on the active dropdown panel
  // Angular Material listens on the overlay panel for keyboard events
  if (key === 'Enter') {
    const dropdownPanel = document.querySelector('.mat-select-panel, .cdk-overlay-pane, [role="listbox"]');
    if (dropdownPanel) {
      dropdownPanel.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    }
    
    // Also try clicking the currently highlighted option
    const highlightedOption = document.querySelector('.mat-option.mat-active, .mat-option:focus, [role="option"].mat-active');
    if (highlightedOption) {
      highlightedOption.click();
    }
  }
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
    
    /* Pan wrapper - handles translation in screen space */
    #crewforms-pan-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    #crewforms-passport-image {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      /* Only animate rotation and scale, not translation */
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
  
  // Structure: container > pan-wrapper (translate) > image (rotate/scale)
  // This ensures panning works in screen coordinates regardless of rotation
  imageOverlay.innerHTML = `
    <div id="crewforms-image-container">
      <div id="crewforms-pan-wrapper">
        <img id="crewforms-passport-image" src="${imageData}" alt="Passport" draggable="false">
      </div>
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
      // No rotation adjustment needed - translation is on a separate wrapper element
      // that is unaffected by the image's rotation (see updateImageTransform)
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
 * We use two separate elements for transforms:
 * - pan-wrapper: handles translate (in screen coordinates)
 * - image: handles rotate and scale
 * 
 * This separation ensures panning always works in screen space,
 * regardless of image rotation. Dragging right always moves right.
 */
function updateImageTransform() {
  const panWrapper = document.getElementById('crewforms-pan-wrapper');
  const image = document.getElementById('crewforms-passport-image');
  if (!panWrapper || !image) return;
  
  const { rotation, zoom, panOffset } = overlayState;
  
  // Apply translation to wrapper (screen coordinates - unaffected by rotation)
  panWrapper.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
  
  // Apply rotation and scale to image only
  image.style.transform = `rotate(${rotation}deg) scale(${zoom})`;
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


