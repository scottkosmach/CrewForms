/**
 * CrewForms Side Panel Application
 * 
 * Main JavaScript file for the side panel UI.
 * Handles:
 * - Tab navigation
 * - Data entry forms
 * - Traveler management
 * - Communication with background service worker
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Get expiry timestamp (12 hours from now)
 */
function getExpiryTime() {
  return Date.now() + (12 * 60 * 60 * 1000);
}

/**
 * Format time remaining until expiry
 */
function formatTimeRemaining(expiresAt) {
  const remaining = expiresAt - Date.now();
  
  if (remaining <= 0) {
    return 'Expired';
  }
  
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  // Remove after 3 seconds
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

/**
 * Send message to background service worker
 */
async function sendMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    console.error('Message error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get data from storage
 */
async function getStorage(keys) {
  const result = await sendMessage({ type: 'GET_STORAGE', keys });
  return result.success ? result.data : {};
}

/**
 * Save data to storage
 */
async function setStorage(data) {
  return await sendMessage({ type: 'SET_STORAGE', data });
}

// ============================================================================
// STATE
// ============================================================================

const state = {
  captain: null,
  boats: [],
  companies: [],
  trips: [],
  travelers: [],
  travelerImages: {},
  currentTab: 'travelers',
  editingBoatId: null,
  editingCompanyId: null,
  // Admin mode state
  adminMode: false,
  scannedFields: [],
  fieldConfigs: {} // Map of position -> config object
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('CrewForms side panel loaded');
  
  // Load data from storage
  await loadAllData();
  
  // Set up event listeners
  setupTabNavigation();
  setupCaptainForm();
  setupBoatForm();
  setupCompanyForm();
  setupTripForm();
  setupTravelerImport();
  setupPasteAction();
  setupAdminMode();
  
  // Update UI
  renderAll();
  
  // Start expiry timer update
  startExpiryTimer();
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  
  // Check if current tab has a mapping (show/hide action bar)
  await checkCurrentTabMapping();
  
  // Listen for tab changes to update action bar visibility
  setupTabChangeListener();
});

/**
 * Load all data from storage
 */
async function loadAllData() {
  const data = await getStorage([
    'captain', 'boats', 'companies', 'trips', 'travelers', 'travelerImages'
  ]);
  
  state.captain = data.captain || null;
  state.boats = data.boats || [];
  state.companies = data.companies || [];
  state.trips = data.trips || [];
  state.travelers = data.travelers || [];
  state.travelerImages = data.travelerImages || {};
}

/**
 * Handle messages from background script
 */
function handleBackgroundMessage(message) {
  console.log('[SidePanel] Received message:', message.type);
  
  switch (message.type) {
    case 'DATA_EXPIRED':
      // Reload data and update UI
      console.log('[SidePanel] Data expired, reloading...');
      loadAllData().then(() => renderAll());
      showToast('Some data has expired and been cleared', 'warning');
      break;
    
    case 'IMAGE_RECEIVED':
      // New passport image received from upload
      console.log('[SidePanel] IMAGE_RECEIVED - Image data received!');
      console.log('[SidePanel] Image data preview:', message.imageData?.substring(0, 100));
      console.log('[SidePanel] Session ID:', message.sessionId);
      
      if (!message.imageData) {
        console.error('[SidePanel] ERROR: No image data in message!');
        showToast('Error: No image data received', 'error');
        break;
      }
      
      handleImageReceived(message.imageData, message.sessionId);
      
      // Close QR modal after receiving first image
      const qrModal = document.getElementById('qrModal');
      if (qrModal && !qrModal.classList.contains('hidden')) {
        qrModal.classList.add('hidden');
        showToast('Passport image received!', 'success');
      }
      break;
    
    case 'SESSION_EXPIRED':
      // Session expired, close modal and notify user
      const modal = document.getElementById('qrModal');
      if (modal) {
        modal.classList.add('hidden');
      }
      activeSessionId = null;
      showToast('Upload session expired', 'warning');
      break;
    
    case 'OCR_COMPLETE':
      // OCR processing complete
      handleOcrComplete(message.travelerId, message.data);
      break;
    
    case 'IMAGE_OVERLAY_CLOSED':
      // Image overlay was closed by user, collapse expanded card
      const expandedCard = document.querySelector('.traveler-card.expanded');
      if (expandedCard) {
        expandedCard.classList.remove('expanded');
        const btn = expandedCard.querySelector('.toggle-traveler');
        if (btn) btn.textContent = 'Details';
      }
      break;
  }
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  state.currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

// ============================================================================
// CAPTAIN FORM
// ============================================================================

function setupCaptainForm() {
  const form = document.getElementById('captainForm');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    
    state.captain = {
      firstName: formData.get('firstName'),
      middleName: formData.get('middleName'),
      lastName: formData.get('lastName'),
      passportNumber: formData.get('passportNumber'),
      dateOfBirth: {
        day: formData.get('dobDay'),
        month: formData.get('dobMonth'),
        year: formData.get('dobYear')
      },
      passportExpiry: {
        day: formData.get('passportExpDay'),
        month: formData.get('passportExpMonth'),
        year: formData.get('passportExpYear')
      },
      nationality: formData.get('nationality'),
      licenseNumber: formData.get('licenseNumber'),
      email: formData.get('email'),
      phone: formData.get('phone')
    };
    
    await setStorage({ captain: state.captain });
    showToast('Captain information saved', 'success');
  });
}

function populateCaptainForm() {
  if (!state.captain) return;
  
  const c = state.captain;
  
  document.getElementById('captainFirstName').value = c.firstName || '';
  document.getElementById('captainMiddleName').value = c.middleName || '';
  document.getElementById('captainLastName').value = c.lastName || '';
  document.getElementById('captainPassportNumber').value = c.passportNumber || '';
  document.getElementById('captainDobDay').value = c.dateOfBirth?.day || '';
  document.getElementById('captainDobMonth').value = c.dateOfBirth?.month || '';
  document.getElementById('captainDobYear').value = c.dateOfBirth?.year || '';
  document.getElementById('captainPassportExpDay').value = c.passportExpiry?.day || '';
  document.getElementById('captainPassportExpMonth').value = c.passportExpiry?.month || '';
  document.getElementById('captainPassportExpYear').value = c.passportExpiry?.year || '';
  document.getElementById('captainNationality').value = c.nationality || '';
  document.getElementById('captainLicenseNumber').value = c.licenseNumber || '';
  document.getElementById('captainEmail').value = c.email || '';
  document.getElementById('captainPhone').value = c.phone || '';
}

// ============================================================================
// BOAT FORM
// ============================================================================

function setupBoatForm() {
  const addBtn = document.getElementById('addBoatBtn');
  const cancelBtn = document.getElementById('cancelBoatBtn');
  const form = document.getElementById('boatForm');
  const modal = document.getElementById('boatFormModal');
  
  addBtn.addEventListener('click', () => {
    state.editingBoatId = null;
    form.reset();
    document.getElementById('boatFormTitle').textContent = 'Add Boat';
    modal.classList.remove('hidden');
  });
  
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    form.reset();
    state.editingBoatId = null;
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    
    const boat = {
      id: state.editingBoatId || generateId(),
      vesselName: formData.get('vesselName'),
      registrationNumber: formData.get('registrationNumber'),
      flagState: formData.get('flagState'),
      homePort: formData.get('homePort'),
      vesselType: formData.get('vesselType'),
      capacity: parseInt(formData.get('capacity')) || null
    };
    
    if (state.editingBoatId) {
      // Update existing boat
      const index = state.boats.findIndex(b => b.id === state.editingBoatId);
      if (index !== -1) {
        state.boats[index] = boat;
      }
    } else {
      // Add new boat
      state.boats.push(boat);
    }
    
    await setStorage({ boats: state.boats });
    
    modal.classList.add('hidden');
    form.reset();
    state.editingBoatId = null;
    
    renderBoatList();
    updateTripSelectors();
    showToast('Boat saved', 'success');
  });
}

function renderBoatList() {
  const list = document.getElementById('boatList');
  
  if (state.boats.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1 .6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
          <path d="M19.38 20A11.6 11.6 0 0 0 21 14l-9-4-9 4c0 2.9.94 5.34 2.81 7.76"/>
          <path d="M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6"/>
        </svg>
        <p>No boats added yet</p>
        <p class="text-muted">Click "Add Boat" to register a vessel</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = state.boats.map(boat => `
    <div class="list-item" data-id="${boat.id}">
      <div class="list-item-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>
          <path d="M12 10v4"/>
        </svg>
      </div>
      <div class="list-item-content">
        <div class="list-item-title">${boat.vesselName}</div>
        <div class="list-item-subtitle">${boat.registrationNumber || 'No registration'} • ${boat.flagState || 'No flag'}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm btn-secondary edit-boat" data-id="${boat.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-boat" data-id="${boat.id}">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  list.querySelectorAll('.edit-boat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editBoat(btn.dataset.id);
    });
  });
  
  list.querySelectorAll('.delete-boat').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBoat(btn.dataset.id);
    });
  });
}

function editBoat(id) {
  const boat = state.boats.find(b => b.id === id);
  if (!boat) return;
  
  state.editingBoatId = id;
  
  document.getElementById('boatFormTitle').textContent = 'Edit Boat';
  document.getElementById('boatId').value = boat.id;
  document.getElementById('boatName').value = boat.vesselName || '';
  document.getElementById('boatRegistration').value = boat.registrationNumber || '';
  document.getElementById('boatFlagState').value = boat.flagState || '';
  document.getElementById('boatHomePort').value = boat.homePort || '';
  document.getElementById('boatType').value = boat.vesselType || '';
  document.getElementById('boatCapacity').value = boat.capacity || '';
  
  document.getElementById('boatFormModal').classList.remove('hidden');
}

async function deleteBoat(id) {
  if (!confirm('Are you sure you want to delete this boat?')) return;
  
  state.boats = state.boats.filter(b => b.id !== id);
  await setStorage({ boats: state.boats });
  
  renderBoatList();
  updateTripSelectors();
  showToast('Boat deleted', 'success');
}

// ============================================================================
// COMPANY FORM
// ============================================================================

function setupCompanyForm() {
  const addBtn = document.getElementById('addCompanyBtn');
  const cancelBtn = document.getElementById('cancelCompanyBtn');
  const form = document.getElementById('companyForm');
  const modal = document.getElementById('companyFormModal');
  
  addBtn.addEventListener('click', () => {
    state.editingCompanyId = null;
    form.reset();
    document.getElementById('companyFormTitle').textContent = 'Add Company';
    modal.classList.remove('hidden');
  });
  
  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    form.reset();
    state.editingCompanyId = null;
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    
    const company = {
      id: state.editingCompanyId || generateId(),
      companyName: formData.get('companyName'),
      registrationNumber: formData.get('registrationNumber'),
      address: formData.get('address'),
      email: formData.get('email'),
      phone: formData.get('phone')
    };
    
    if (state.editingCompanyId) {
      // Update existing company
      const index = state.companies.findIndex(c => c.id === state.editingCompanyId);
      if (index !== -1) {
        state.companies[index] = company;
      }
    } else {
      // Add new company
      state.companies.push(company);
    }
    
    await setStorage({ companies: state.companies });
    
    modal.classList.add('hidden');
    form.reset();
    state.editingCompanyId = null;
    
    renderCompanyList();
    updateTripSelectors();
    showToast('Company saved', 'success');
  });
}

function renderCompanyList() {
  const list = document.getElementById('companyList');
  
  if (state.companies.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M3 21h18"/>
          <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>
        </svg>
        <p>No companies added yet</p>
        <p class="text-muted">Click "Add Company" to register a company</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = state.companies.map(company => `
    <div class="list-item" data-id="${company.id}">
      <div class="list-item-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 21h18"/>
          <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/>
        </svg>
      </div>
      <div class="list-item-content">
        <div class="list-item-title">${company.companyName}</div>
        <div class="list-item-subtitle">${company.registrationNumber || 'No registration'}</div>
      </div>
      <div class="list-item-actions">
        <button class="btn btn-sm btn-secondary edit-company" data-id="${company.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-company" data-id="${company.id}">Delete</button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  list.querySelectorAll('.edit-company').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editCompany(btn.dataset.id);
    });
  });
  
  list.querySelectorAll('.delete-company').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCompany(btn.dataset.id);
    });
  });
}

function editCompany(id) {
  const company = state.companies.find(c => c.id === id);
  if (!company) return;
  
  state.editingCompanyId = id;
  
  document.getElementById('companyFormTitle').textContent = 'Edit Company';
  document.getElementById('companyId').value = company.id;
  document.getElementById('companyName').value = company.companyName || '';
  document.getElementById('companyRegistration').value = company.registrationNumber || '';
  document.getElementById('companyAddress').value = company.address || '';
  document.getElementById('companyEmail').value = company.email || '';
  document.getElementById('companyPhone').value = company.phone || '';
  
  document.getElementById('companyFormModal').classList.remove('hidden');
}

async function deleteCompany(id) {
  if (!confirm('Are you sure you want to delete this company?')) return;
  
  state.companies = state.companies.filter(c => c.id !== id);
  await setStorage({ companies: state.companies });
  
  renderCompanyList();
  updateTripSelectors();
  showToast('Company deleted', 'success');
}

// ============================================================================
// TRIP FORM
// ============================================================================

function setupTripForm() {
  const form = document.getElementById('tripForm');
  const clearBtn = document.getElementById('clearTripBtn');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    
    const trip = {
      id: generateId(),
      boatId: formData.get('boatId'),
      companyId: formData.get('companyId'),
      departureDate: {
        day: formData.get('departureDay'),
        month: formData.get('departureMonth'),
        year: formData.get('departureYear')
      },
      returnDate: {
        day: formData.get('returnDay'),
        month: formData.get('returnMonth'),
        year: formData.get('returnYear')
      },
      departurePort: formData.get('departurePort'),
      destinationPorts: formData.get('destinationPorts'),
      purpose: formData.get('purpose'),
      guestCount: parseInt(formData.get('guestCount')) || 0,
      expiresAt: getExpiryTime(),
      createdAt: Date.now()
    };
    
    // Replace existing trip (only one active trip at a time)
    state.trips = [trip];
    
    await setStorage({ trips: state.trips });
    
    updateTripExpiryDisplay();
    showToast('Trip saved', 'success');
  });
  
  clearBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear the current trip?')) return;
    
    state.trips = [];
    await setStorage({ trips: state.trips });
    
    form.reset();
    updateTripExpiryDisplay();
    showToast('Trip cleared', 'success');
  });
}

function populateTripForm() {
  const trip = state.trips[0];
  if (!trip) return;
  
  document.getElementById('tripBoat').value = trip.boatId || '';
  document.getElementById('tripCompany').value = trip.companyId || '';
  document.getElementById('tripDepartureDay').value = trip.departureDate?.day || '';
  document.getElementById('tripDepartureMonth').value = trip.departureDate?.month || '';
  document.getElementById('tripDepartureYear').value = trip.departureDate?.year || '';
  document.getElementById('tripReturnDay').value = trip.returnDate?.day || '';
  document.getElementById('tripReturnMonth').value = trip.returnDate?.month || '';
  document.getElementById('tripReturnYear').value = trip.returnDate?.year || '';
  document.getElementById('tripDeparturePort').value = trip.departurePort || '';
  document.getElementById('tripDestinationPorts').value = trip.destinationPorts || '';
  document.getElementById('tripPurpose').value = trip.purpose || '';
  document.getElementById('tripGuestCount').value = trip.guestCount || '';
}

function updateTripSelectors() {
  const boatSelect = document.getElementById('tripBoat');
  const companySelect = document.getElementById('tripCompany');
  
  // Preserve current selections
  const currentBoat = boatSelect.value;
  const currentCompany = companySelect.value;
  
  // Update boat options
  boatSelect.innerHTML = '<option value="">-- Select a Boat --</option>' +
    state.boats.map(b => `<option value="${b.id}">${b.vesselName}</option>`).join('');
  
  // Update company options
  companySelect.innerHTML = '<option value="">-- Select a Company --</option>' +
    state.companies.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
  
  // Restore selections
  boatSelect.value = currentBoat;
  companySelect.value = currentCompany;
}

function updateTripExpiryDisplay() {
  const notice = document.getElementById('tripExpiryNotice');
  const timeSpan = document.getElementById('tripExpiryTime');
  
  const trip = state.trips[0];
  
  if (trip && trip.expiresAt) {
    notice.style.display = 'flex';
    timeSpan.textContent = formatTimeRemaining(trip.expiresAt);
  } else {
    notice.style.display = 'none';
  }
}

function startExpiryTimer() {
  // Update expiry display every minute
  setInterval(() => {
    updateTripExpiryDisplay();
  }, 60000);
}

// ============================================================================
// TRAVELER IMPORT
// ============================================================================

// Track current active session
let activeSessionId = null;

function setupTravelerImport() {
  const importBtn = document.getElementById('importGuestsBtn');
  const closeQrBtn = document.getElementById('closeQrBtn');
  const qrModal = document.getElementById('qrModal');
  
  importBtn.addEventListener('click', async () => {
    // Show modal
    qrModal.classList.remove('hidden');
    
    // Request session from server
    const result = await sendMessage({ type: 'CREATE_SESSION' });
    
    if (result.success) {
      activeSessionId = result.sessionId;
      displayQrCode(result.uploadUrl);
      
      // Start polling for uploaded images
      await sendMessage({ type: 'START_POLLING', sessionId: result.sessionId });
      console.log('Started polling for session:', result.sessionId);
    } else {
      showToast('Failed to create upload session: ' + result.error, 'error');
      qrModal.classList.add('hidden');
    }
  });
  
  closeQrBtn.addEventListener('click', () => {
    // Stop polling when closing the modal
    if (activeSessionId) {
      sendMessage({ type: 'STOP_POLLING', sessionId: activeSessionId });
      activeSessionId = null;
    }
    qrModal.classList.add('hidden');
  });
}

function displayQrCode(url) {
  const qrContainer = document.getElementById('qrCode');
  
  // Clear any existing content
  qrContainer.innerHTML = '';
  
  try {
    // Check if QRCode library is loaded
    if (typeof QRCode === 'undefined') {
      throw new Error('QRCode library not loaded');
    }
    
    // Create a wrapper div for the QR code
    const qrWrapper = document.createElement('div');
    qrWrapper.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center;';
    qrContainer.appendChild(qrWrapper);
    
    // Generate QR code using the QRCode library
    // This library uses: QRCode(text, size) and returns an object with createImgTag()
    const qr = QRCode(url, 180);
    const img = qr.createImgTag('Scan to upload passports');
    img.style.cssText = 'border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
    qrWrapper.appendChild(img);
    
    console.log('QR code generated for:', url);
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    // Fallback: show URL as clickable link
    qrContainer.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <p style="font-size: 12px; margin-bottom: 10px;">Open this URL on your phone:</p>
        <a href="${url}" target="_blank" style="font-size: 11px; word-break: break-all; color: #0891b2;">${url}</a>
      </div>
    `;
  }
}

function handleImageReceived(imageData, sessionId) {
  console.log('[SidePanel] handleImageReceived called');
  console.log('[SidePanel] Image data length:', imageData?.length || 0);
  
  // Create a new traveler entry with the image
  const travelerId = generateId();
  console.log('[SidePanel] Generated traveler ID:', travelerId);
  
  // Store image separately (large data)
  state.travelerImages[travelerId] = {
    data: imageData,
    expiresAt: getExpiryTime()
  };
  console.log('[SidePanel] Stored image in state.travelerImages');
  
  // Create traveler placeholder
  const traveler = {
    id: travelerId,
    firstName: '',
    lastName: '',
    status: 'processing', // 'processing', 'ready', 'error'
    expiresAt: getExpiryTime()
  };
  
  state.travelers.push(traveler);
  console.log('[SidePanel] Added traveler to state, total travelers:', state.travelers.length);
  
  // Save to storage
  setStorage({
    travelers: state.travelers,
    travelerImages: state.travelerImages
  }).then(() => {
    console.log('[SidePanel] Saved to storage');
  }).catch(err => {
    console.error('[SidePanel] Failed to save to storage:', err);
  });
  
  // Render updated list
  console.log('[SidePanel] Rendering traveler list...');
  renderTravelerList();
  
  // Trigger OCR processing
  console.log('[SidePanel] Starting OCR processing...');
  processOcr(travelerId, imageData);
}

async function processOcr(travelerId, imageData) {
  const result = await sendMessage({
    type: 'PROCESS_OCR',
    imageData
  });
  
  if (result.success) {
    handleOcrComplete(travelerId, result.data);
  } else {
    // Mark traveler as error
    const traveler = state.travelers.find(t => t.id === travelerId);
    if (traveler) {
      traveler.status = 'error';
      traveler.error = result.error;
      await setStorage({ travelers: state.travelers });
      renderTravelerList();
    }
    showToast('OCR failed: ' + result.error, 'error');
  }
}

function handleOcrComplete(travelerId, data) {
  const traveler = state.travelers.find(t => t.id === travelerId);
  if (!traveler) return;
  
  // Update traveler with OCR data
  Object.assign(traveler, {
    firstName: data.firstName || '',
    middleName: data.middleName || '',
    lastName: data.lastName || '',
    passportNumber: data.passportNumber || '',
    nationality: data.nationality || '',
    dateOfBirth: data.dateOfBirth || {},
    gender: data.gender || '',
    dateOfIssue: data.dateOfIssue || {},
    dateOfExpiry: data.dateOfExpiry || {},
    placeOfBirth: data.placeOfBirth || '',
    issuingAuthority: data.issuingAuthority || '',
    passportType: data.passportType || '',
    status: 'ready',
    confidence: data.confidence || null
  });
  
  // Save and render
  setStorage({ travelers: state.travelers });
  renderTravelerList();
  updatePasteSourceOptions();
  
  showToast(`Extracted data for ${traveler.firstName} ${traveler.lastName}`, 'success');
}

function renderTravelerList() {
  const list = document.getElementById('travelerList');
  
  // Debug: Log to verify new code is running
  console.log('renderTravelerList: Rendering travelers with new fields support');
  
  if (state.travelers.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>No travelers imported yet</p>
        <p class="text-muted">Click "Import Guests" to scan passport images</p>
      </div>
    `;
    return;
  }
  
  list.innerHTML = state.travelers.map((traveler, index) => {
    const imageData = state.travelerImages[traveler.id];
    const initials = getInitials(traveler.firstName, traveler.lastName);
    
    return `
      <div class="traveler-card" data-id="${traveler.id}">
        <div class="traveler-card-header">
          <div class="traveler-thumbnail">
            ${imageData ? 
              `<img src="${imageData.data}" alt="Passport">` : 
              `<span>${initials || '?'}</span>`
            }
          </div>
          <div class="traveler-info ${traveler.status === 'error' ? 'retry-ocr' : ''}" data-id="${traveler.id}" style="${traveler.status === 'error' ? 'cursor: pointer;' : ''}">
            <div class="traveler-name">
              ${traveler.status === 'processing' ? 'Processing...' : 
                traveler.status === 'error' ? '⚠️ Error - Tap to retry' :
                `${traveler.firstName} ${traveler.lastName}` || 'Unknown'
              }
            </div>
            <div class="traveler-passport">
              ${traveler.passportNumber || 'Guest ' + (index + 1)}
            </div>
          </div>
          <div class="traveler-actions">
            <button class="btn btn-sm btn-secondary toggle-traveler" data-id="${traveler.id}">
              ${traveler.expanded ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>
        <div class="traveler-card-body">
          <div class="traveler-details-actions">
            <button class="btn btn-sm btn-secondary edit-traveler" data-id="${traveler.id}">✎ Edit</button>
            <button class="btn btn-sm btn-success save-traveler hidden" data-id="${traveler.id}">Save</button>
            <button class="btn btn-sm btn-secondary cancel-edit hidden" data-id="${traveler.id}">Cancel</button>
          </div>
          <div class="traveler-fields" data-id="${traveler.id}">
            <div class="traveler-field">
              <div class="traveler-field-label">First Name</div>
              <div class="traveler-field-value" data-field="firstName">${traveler.firstName || '-'}</div>
              <input class="traveler-field-input hidden" data-field="firstName" type="text" value="${traveler.firstName || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Middle Name</div>
              <div class="traveler-field-value" data-field="middleName">${traveler.middleName || '-'}</div>
              <input class="traveler-field-input hidden" data-field="middleName" type="text" value="${traveler.middleName || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Last Name</div>
              <div class="traveler-field-value" data-field="lastName">${traveler.lastName || '-'}</div>
              <input class="traveler-field-input hidden" data-field="lastName" type="text" value="${traveler.lastName || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Passport #</div>
              <div class="traveler-field-value" data-field="passportNumber">${traveler.passportNumber || '-'}</div>
              <input class="traveler-field-input hidden" data-field="passportNumber" type="text" value="${traveler.passportNumber || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Nationality</div>
              <div class="traveler-field-value" data-field="nationality">${traveler.nationality || '-'}</div>
              <input class="traveler-field-input hidden" data-field="nationality" type="text" value="${traveler.nationality || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Date of Birth</div>
              <div class="traveler-field-value" data-field="dateOfBirth">
                ${formatDateObj(traveler.dateOfBirth)}
              </div>
              <div class="traveler-date-inputs hidden" data-field="dateOfBirth">
                <input class="traveler-field-input date-part" data-part="day" type="text" placeholder="DD" maxlength="2" value="${traveler.dateOfBirth?.day || ''}">
                <span>/</span>
                <input class="traveler-field-input date-part" data-part="month" type="text" placeholder="MM" maxlength="2" value="${traveler.dateOfBirth?.month || ''}">
                <span>/</span>
                <input class="traveler-field-input date-part" data-part="year" type="text" placeholder="YYYY" maxlength="4" value="${traveler.dateOfBirth?.year || ''}">
              </div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Gender</div>
              <div class="traveler-field-value" data-field="gender">${traveler.gender || '-'}</div>
              <select class="traveler-field-input hidden" data-field="gender">
                <option value="" ${!traveler.gender ? 'selected' : ''}>-</option>
                <option value="M" ${traveler.gender === 'M' ? 'selected' : ''}>M</option>
                <option value="F" ${traveler.gender === 'F' ? 'selected' : ''}>F</option>
              </select>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Date of Issue</div>
              <div class="traveler-field-value" data-field="dateOfIssue">
                ${formatDateObj(traveler.dateOfIssue || {})}
              </div>
              <div class="traveler-date-inputs hidden" data-field="dateOfIssue">
                <input class="traveler-field-input date-part" data-part="day" type="text" placeholder="DD" maxlength="2" value="${traveler.dateOfIssue?.day || ''}">
                <span>/</span>
                <input class="traveler-field-input date-part" data-part="month" type="text" placeholder="MM" maxlength="2" value="${traveler.dateOfIssue?.month || ''}">
                <span>/</span>
                <input class="traveler-field-input date-part" data-part="year" type="text" placeholder="YYYY" maxlength="4" value="${traveler.dateOfIssue?.year || ''}">
              </div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Date of Expiry</div>
              <div class="traveler-field-value" data-field="dateOfExpiry">
                ${formatDateObj(traveler.dateOfExpiry || {})}
              </div>
              <div class="traveler-date-inputs hidden" data-field="dateOfExpiry">
                <input class="traveler-field-input date-part" data-part="day" type="text" placeholder="DD" maxlength="2" value="${traveler.dateOfExpiry?.day || ''}">
                <span>/</span>
                <input class="traveler-field-input date-part" data-part="month" type="text" placeholder="MM" maxlength="2" value="${traveler.dateOfExpiry?.month || ''}">
                <span>/</span>
                <input class="traveler-field-input date-part" data-part="year" type="text" placeholder="YYYY" maxlength="4" value="${traveler.dateOfExpiry?.year || ''}">
              </div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Place of Birth</div>
              <div class="traveler-field-value" data-field="placeOfBirth">${traveler.placeOfBirth || '-'}</div>
              <input class="traveler-field-input hidden" data-field="placeOfBirth" type="text" value="${traveler.placeOfBirth || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Issuing Authority</div>
              <div class="traveler-field-value" data-field="issuingAuthority">${traveler.issuingAuthority || '-'}</div>
              <input class="traveler-field-input hidden" data-field="issuingAuthority" type="text" value="${traveler.issuingAuthority || ''}">
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Passport Type</div>
              <div class="traveler-field-value" data-field="passportType">${traveler.passportType || '-'}</div>
              <select class="traveler-field-input hidden" data-field="passportType">
                <option value="" ${!traveler.passportType ? 'selected' : ''}>-</option>
                <option value="passport" ${traveler.passportType === 'passport' ? 'selected' : ''}>Passport</option>
                <option value="passport card" ${traveler.passportType === 'passport card' ? 'selected' : ''}>Passport Card</option>
              </select>
            </div>
          </div>
          <div class="traveler-delete-section">
            <button class="btn btn-danger delete-traveler-bottom" data-id="${traveler.id}">🗑 Delete Traveler</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add event listeners
  list.querySelectorAll('.toggle-traveler').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTravelerCard(btn.dataset.id);
    });
  });
  
  // Delete button (now at bottom of details)
  list.querySelectorAll('.delete-traveler-bottom').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Are you sure you want to delete this traveler?')) {
        deleteTraveler(btn.dataset.id);
      }
    });
  });
  
  // Edit button
  list.querySelectorAll('.edit-traveler').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      enterEditMode(btn.dataset.id);
    });
  });
  
  // Save button
  list.querySelectorAll('.save-traveler').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveEditedTraveler(btn.dataset.id);
    });
  });
  
  // Cancel button
  list.querySelectorAll('.cancel-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      exitEditMode(btn.dataset.id);
    });
  });
  
  // Add retry OCR click handlers for failed travelers
  list.querySelectorAll('.retry-ocr').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      retryOcr(el.dataset.id);
    });
  });
}

function getInitials(firstName, lastName) {
  const f = (firstName || '').charAt(0).toUpperCase();
  const l = (lastName || '').charAt(0).toUpperCase();
  return f + l;
}

function formatDateObj(dateObj) {
  if (!dateObj || (!dateObj.day && !dateObj.month && !dateObj.year)) {
    return '-';
  }
  return `${dateObj.day || '??'}/${dateObj.month || '??'}/${dateObj.year || '????'}`;
}

function toggleTravelerCard(id) {
  const card = document.querySelector(`.traveler-card[data-id="${id}"]`);
  if (card) {
    const wasExpanded = card.classList.contains('expanded');
    
    // Collapse all other cards first
    document.querySelectorAll('.traveler-card.expanded').forEach(c => {
      if (c !== card) {
        c.classList.remove('expanded');
        c.querySelector('.toggle-traveler').textContent = 'Details';
      }
    });
    
    // Toggle this card
    card.classList.toggle('expanded');
    const isExpanded = card.classList.contains('expanded');
    const btn = card.querySelector('.toggle-traveler');
    btn.textContent = isExpanded ? 'Hide' : 'Details';
    
    // Show/hide image overlay based on expanded state
    if (isExpanded) {
      const imageData = state.travelerImages[id];
      if (imageData) {
        showImageOverlayOnPage(imageData.data);
      }
    } else {
      hideImageOverlayOnPage();
    }
  }
}

async function deleteTraveler(id) {
  // Hide image overlay when deleting
  hideImageOverlayOnPage();
  
  state.travelers = state.travelers.filter(t => t.id !== id);
  delete state.travelerImages[id];
  
  await setStorage({
    travelers: state.travelers,
    travelerImages: state.travelerImages
  });
  
  renderTravelerList();
  updatePasteSourceOptions();
  showToast('Traveler deleted', 'success');
}

// ============================================================================
// EDIT MODE
// ============================================================================

/**
 * Enter edit mode for a traveler
 */
function enterEditMode(travelerId) {
  const card = document.querySelector(`.traveler-card[data-id="${travelerId}"]`);
  if (!card) return;
  
  // Show/hide appropriate buttons
  card.querySelector('.edit-traveler').classList.add('hidden');
  card.querySelector('.save-traveler').classList.remove('hidden');
  card.querySelector('.cancel-edit').classList.remove('hidden');
  
  // Show inputs, hide values
  const fieldsContainer = card.querySelector('.traveler-fields');
  fieldsContainer.querySelectorAll('.traveler-field-value').forEach(el => {
    el.classList.add('hidden');
  });
  fieldsContainer.querySelectorAll('.traveler-field-input').forEach(el => {
    el.classList.remove('hidden');
  });
  fieldsContainer.querySelectorAll('.traveler-date-inputs').forEach(el => {
    el.classList.remove('hidden');
  });
  
  // Add editing class to card
  card.classList.add('editing');
}

/**
 * Exit edit mode without saving
 */
function exitEditMode(travelerId) {
  const card = document.querySelector(`.traveler-card[data-id="${travelerId}"]`);
  if (!card) return;
  
  // Show/hide appropriate buttons
  card.querySelector('.edit-traveler').classList.remove('hidden');
  card.querySelector('.save-traveler').classList.add('hidden');
  card.querySelector('.cancel-edit').classList.add('hidden');
  
  // Hide inputs, show values
  const fieldsContainer = card.querySelector('.traveler-fields');
  fieldsContainer.querySelectorAll('.traveler-field-value').forEach(el => {
    el.classList.remove('hidden');
  });
  fieldsContainer.querySelectorAll('.traveler-field-input').forEach(el => {
    el.classList.add('hidden');
  });
  fieldsContainer.querySelectorAll('.traveler-date-inputs').forEach(el => {
    el.classList.add('hidden');
  });
  
  // Remove editing class
  card.classList.remove('editing');
  
  // Re-render to reset any input values
  renderTravelerList();
}

/**
 * Save edited traveler data
 */
async function saveEditedTraveler(travelerId) {
  const card = document.querySelector(`.traveler-card[data-id="${travelerId}"]`);
  if (!card) return;
  
  const traveler = state.travelers.find(t => t.id === travelerId);
  if (!traveler) return;
  
  const fieldsContainer = card.querySelector('.traveler-fields');
  
  // Collect simple text fields
  const simpleFields = ['firstName', 'middleName', 'lastName', 'passportNumber', 'nationality', 'placeOfBirth', 'issuingAuthority'];
  simpleFields.forEach(field => {
    const input = fieldsContainer.querySelector(`input[data-field="${field}"]`);
    if (input) {
      traveler[field] = input.value.trim() || '';
    }
  });
  
  // Collect select fields
  const selectFields = ['gender', 'passportType'];
  selectFields.forEach(field => {
    const select = fieldsContainer.querySelector(`select[data-field="${field}"]`);
    if (select) {
      traveler[field] = select.value || '';
    }
  });
  
  // Collect date fields
  const dateFields = ['dateOfBirth', 'dateOfIssue', 'dateOfExpiry'];
  dateFields.forEach(field => {
    const dateInputs = fieldsContainer.querySelector(`.traveler-date-inputs[data-field="${field}"]`);
    if (dateInputs) {
      const day = dateInputs.querySelector('input[data-part="day"]')?.value.trim() || '';
      const month = dateInputs.querySelector('input[data-part="month"]')?.value.trim() || '';
      const year = dateInputs.querySelector('input[data-part="year"]')?.value.trim() || '';
      traveler[field] = { day, month, year };
    }
  });
  
  // Save to storage
  await setStorage({ travelers: state.travelers });
  
  // Exit edit mode and re-render
  exitEditMode(travelerId);
  renderTravelerList();
  updatePasteSourceOptions();
  
  showToast('Traveler data saved', 'success');
}

// ============================================================================
// IMAGE OVERLAY MESSAGING
// ============================================================================

/**
 * Send message to background to show image overlay on page
 * Background script handles injecting content script if needed
 */
async function showImageOverlayOnPage(imageData) {
  try {
    await sendMessage({
      type: 'SHOW_IMAGE_OVERLAY',
      imageData: imageData
    });
  } catch (error) {
    console.log('Could not show image overlay:', error.message);
  }
}

/**
 * Send message to background to hide image overlay on page
 */
async function hideImageOverlayOnPage() {
  try {
    await sendMessage({
      type: 'HIDE_IMAGE_OVERLAY'
    });
  } catch (error) {
    console.log('Could not hide image overlay:', error.message);
  }
}

/**
 * Retry OCR processing for a failed traveler
 */
async function retryOcr(id) {
  const traveler = state.travelers.find(t => t.id === id);
  const imageData = state.travelerImages[id];
  
  if (!traveler || !imageData) {
    showToast('Cannot retry - image data not found', 'error');
    return;
  }
  
  // Reset status to processing
  traveler.status = 'processing';
  traveler.error = null;
  await setStorage({ travelers: state.travelers });
  renderTravelerList();
  
  showToast('Retrying OCR...', 'info');
  
  // Re-run OCR
  await processOcr(id, imageData.data);
}

// ============================================================================
// PASTE ACTION
// ============================================================================

function setupPasteAction() {
  const pasteSource = document.getElementById('pasteSource');
  const pasteBtn = document.getElementById('pasteBtn');
  
  pasteSource.addEventListener('change', () => {
    pasteBtn.disabled = !pasteSource.value;
  });
  
  pasteBtn.addEventListener('click', async () => {
    const source = pasteSource.value;
    if (!source) return;
    
    // Get data based on source
    let data;
    let dataType;
    
    if (source === 'captain') {
      data = { captain: state.captain };
      dataType = 'captain';
    } else if (source === 'boat') {
      const trip = state.trips[0];
      const boat = state.boats.find(b => b.id === trip?.boatId);
      data = { boat };
      dataType = 'boat';
    } else if (source === 'company') {
      const trip = state.trips[0];
      const company = state.companies.find(c => c.id === trip?.companyId);
      data = { company };
      dataType = 'company';
    } else if (source === 'trip') {
      data = { trip: state.trips[0] };
      dataType = 'trip';
    } else {
      // Traveler ID
      const traveler = state.travelers.find(t => t.id === source);
      data = { traveler };
      dataType = 'traveler';
    }
    
    if (!data || !Object.values(data)[0]) {
      showToast('No data available to paste', 'error');
      return;
    }
    
    // Get active tab
    const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
    if (!tabResult.success || !tabResult.tab) {
      showToast('Could not detect active tab', 'error');
      return;
    }
    
    // Get mapping for current URL
    const mappingResult = await sendMessage({
      type: 'GET_MAPPING',
      url: tabResult.tab.url
    });
    
    if (!mappingResult.success || !mappingResult.mapping) {
      showToast('No form mapping found for this website', 'warning');
      return;
    }
    
    // Log data being sent for debugging
    console.log('[SidePanel] Sending paste data:', JSON.stringify(data, null, 2));
    console.log('[SidePanel] Using mapping:', mappingResult.mapping.name, 'with', mappingResult.mapping.fields?.length, 'fields');
    
    // Send fill command
    const fillResult = await sendMessage({
      type: 'FILL_FORM',
      tabId: tabResult.tab.id,
      data,
      mapping: mappingResult.mapping
    });
    
    console.log('[SidePanel] Fill result:', fillResult);
    
    if (fillResult.success) {
      // Show detailed feedback
      let message = `Filled ${fillResult.filledCount}`;
      if (fillResult.totalMapped) {
        message += `/${fillResult.totalMapped}`;
      }
      message += ' fields';
      
      if (fillResult.skipped > 0) {
        message += ` (${fillResult.skipped} skipped - no data)`;
      }
      
      if (fillResult.filledCount === 0) {
        showToast(message + ' - check console for details', 'warning');
      } else if (fillResult.errors && fillResult.errors.length > 0) {
        showToast(message + ' with some errors', 'warning');
      } else {
        showToast(message, 'success');
      }
    } else {
      showToast('Failed to fill form: ' + fillResult.error, 'error');
    }
  });
}

function updatePasteSourceOptions() {
  const optgroup = document.getElementById('pasteSourceTravelers');
  
  optgroup.innerHTML = state.travelers
    .filter(t => t.status === 'ready')
    .map((t, i) => `
      <option value="${t.id}">
        ${t.firstName} ${t.lastName} (Guest ${i + 1})
      </option>
    `).join('');
}

// ============================================================================
// URL MAPPING DETECTION & ACTION BAR
// ============================================================================

/**
 * Check if the current active tab URL has a matching field mapping.
 * Shows or hides the action bar based on result.
 */
async function checkCurrentTabMapping() {
  try {
    // Get the active tab
    const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
    
    if (!tabResult.success || !tabResult.tab || !tabResult.tab.url) {
      console.log('No active tab found or no URL');
      hideActionBar();
      return;
    }
    
    const currentUrl = tabResult.tab.url;
    console.log('Checking mapping for URL:', currentUrl);
    
    // Skip chrome:// and extension pages
    if (currentUrl.startsWith('chrome://') || currentUrl.startsWith('chrome-extension://')) {
      console.log('Skipping internal page');
      hideActionBar();
      return;
    }
    
    // Check if there's a mapping for this URL
    const mappingResult = await sendMessage({
      type: 'GET_MAPPING',
      url: currentUrl
    });
    
    if (mappingResult.success && mappingResult.mapping) {
      console.log('Found mapping for URL:', mappingResult.mapping);
      showActionBar();
    } else {
      console.log('No mapping found for URL');
      hideActionBar();
    }
  } catch (error) {
    console.error('Error checking tab mapping:', error);
    hideActionBar();
  }
}

/**
 * Show the action bar footer
 */
function showActionBar() {
  const actionBar = document.getElementById('actionBar');
  if (actionBar) {
    actionBar.classList.remove('hidden');
    console.log('Action bar shown');
  }
}

/**
 * Hide the action bar footer
 */
function hideActionBar() {
  const actionBar = document.getElementById('actionBar');
  if (actionBar) {
    actionBar.classList.add('hidden');
    console.log('Action bar hidden');
  }
}

/**
 * Set up listener for tab changes to update action bar visibility.
 * Uses chrome.tabs.onActivated and chrome.tabs.onUpdated events.
 */
function setupTabChangeListener() {
  // Listen for tab activation (switching tabs)
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    console.log('Tab activated:', activeInfo.tabId);
    // Small delay to ensure tab info is available
    setTimeout(() => checkCurrentTabMapping(), 100);
  });
  
  // Listen for tab URL changes (navigation within a tab)
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Only check when the URL changes and loading is complete
    if (changeInfo.status === 'complete') {
      console.log('Tab updated:', tabId, changeInfo);
      
      // Check if this is the active tab
      const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
      if (tabResult.success && tabResult.tab && tabResult.tab.id === tabId) {
        checkCurrentTabMapping();
      }
    }
  });
  
  console.log('Tab change listeners set up');
}

// ============================================================================
// RENDER ALL
// ============================================================================

function renderAll() {
  populateCaptainForm();
  renderBoatList();
  renderCompanyList();
  updateTripSelectors();
  populateTripForm();
  renderTravelerList();
  updatePasteSourceOptions();
  updateTripExpiryDisplay();
}

// ============================================================================
// ADMIN MODE - MAPPING ASSISTANT
// ============================================================================

/**
 * Available data sources for field mapping
 */
const DATA_SOURCES = {
  traveler: [
    { value: 'traveler.firstName', label: 'First Name' },
    { value: 'traveler.middleName', label: 'Middle Name' },
    { value: 'traveler.lastName', label: 'Last Name' },
    { value: 'traveler.passportNumber', label: 'Passport Number' },
    { value: 'traveler.nationality', label: 'Nationality' },
    { value: 'traveler.gender', label: 'Gender' },
    { value: 'traveler.placeOfBirth', label: 'Place of Birth' },
    // Full date sources - for fields that accept a complete formatted date
    { value: 'traveler.dateOfBirth', label: 'Date of Birth (Full Date)' },
    { value: 'traveler.dateOfIssue', label: 'Issue Date (Full Date)' },
    { value: 'traveler.dateOfExpiry', label: 'Expiry Date (Full Date)' },
    // Individual date components - for forms with separate day/month/year fields
    { value: 'traveler.dateOfBirth.day', label: 'DOB - Day' },
    { value: 'traveler.dateOfBirth.month', label: 'DOB - Month' },
    { value: 'traveler.dateOfBirth.year', label: 'DOB - Year' },
    { value: 'traveler.dateOfIssue.day', label: 'Issue Date - Day' },
    { value: 'traveler.dateOfIssue.month', label: 'Issue Date - Month' },
    { value: 'traveler.dateOfIssue.year', label: 'Issue Date - Year' },
    { value: 'traveler.dateOfExpiry.day', label: 'Expiry Date - Day' },
    { value: 'traveler.dateOfExpiry.month', label: 'Expiry Date - Month' },
    { value: 'traveler.dateOfExpiry.year', label: 'Expiry Date - Year' },
    { value: 'traveler.issuingAuthority', label: 'Issuing Authority' },
    { value: 'traveler.passportType', label: 'Passport Type' }
  ],
  captain: [
    { value: 'captain.firstName', label: 'First Name' },
    { value: 'captain.middleName', label: 'Middle Name' },
    { value: 'captain.lastName', label: 'Last Name' },
    { value: 'captain.passportNumber', label: 'Passport Number' },
    { value: 'captain.nationality', label: 'Nationality' },
    { value: 'captain.licenseNumber', label: 'License Number' },
    { value: 'captain.email', label: 'Email' },
    { value: 'captain.phone', label: 'Phone' },
    // Full date sources - for fields that accept a complete formatted date
    { value: 'captain.dateOfBirth', label: 'Date of Birth (Full Date)' },
    { value: 'captain.passportExpiry', label: 'Passport Expiry (Full Date)' },
    // Individual date components - for forms with separate day/month/year fields
    { value: 'captain.dateOfBirth.day', label: 'DOB - Day' },
    { value: 'captain.dateOfBirth.month', label: 'DOB - Month' },
    { value: 'captain.dateOfBirth.year', label: 'DOB - Year' },
    { value: 'captain.passportExpiry.day', label: 'Passport Expiry - Day' },
    { value: 'captain.passportExpiry.month', label: 'Passport Expiry - Month' },
    { value: 'captain.passportExpiry.year', label: 'Passport Expiry - Year' }
  ],
  boat: [
    { value: 'boat.vesselName', label: 'Vessel Name' },
    { value: 'boat.registrationNumber', label: 'Registration Number' },
    { value: 'boat.flagState', label: 'Flag State' },
    { value: 'boat.homePort', label: 'Home Port' },
    { value: 'boat.vesselType', label: 'Vessel Type' },
    { value: 'boat.capacity', label: 'Capacity' }
  ],
  company: [
    { value: 'company.companyName', label: 'Company Name' },
    { value: 'company.registrationNumber', label: 'Registration Number' },
    { value: 'company.address', label: 'Address' },
    { value: 'company.email', label: 'Email' },
    { value: 'company.phone', label: 'Phone' }
  ],
  trip: [
    { value: 'trip.departurePort', label: 'Departure Port' },
    { value: 'trip.destinationPorts', label: 'Destination Ports' },
    { value: 'trip.purpose', label: 'Purpose' },
    { value: 'trip.guestCount', label: 'Guest Count' },
    // Full date sources - for fields that accept a complete formatted date
    { value: 'trip.departureDate', label: 'Departure Date (Full Date)' },
    { value: 'trip.returnDate', label: 'Return Date (Full Date)' },
    // Individual date components - for forms with separate day/month/year fields
    { value: 'trip.departureDate.day', label: 'Departure - Day' },
    { value: 'trip.departureDate.month', label: 'Departure - Month' },
    { value: 'trip.departureDate.year', label: 'Departure - Year' },
    { value: 'trip.returnDate.day', label: 'Return - Day' },
    { value: 'trip.returnDate.month', label: 'Return - Month' },
    { value: 'trip.returnDate.year', label: 'Return - Year' }
  ]
};

/**
 * Input behavior options for form fields
 */
const INPUT_BEHAVIORS = [
  { value: 'paste', label: 'Direct Input (Paste)' },
  { value: 'select-match', label: 'Dropdown - Match Text' },
  { value: 'select-keypress', label: 'Dropdown - Keypress Navigation' },
  { value: 'click-select', label: 'Dropdown - Click to Select' }
];

/**
 * Date format options
 */
const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (27/12/2025)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/27/2025)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2025-12-27)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (27-12-2025)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (12-27-2025)' },
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (27.12.2025)' }
];

/**
 * Full date sources - these map to complete date objects {day, month, year}
 * Used to detect when the admin selects a full date source that needs formatting
 */
const FULL_DATE_SOURCES = [
  'traveler.dateOfBirth',
  'traveler.dateOfIssue',
  'traveler.dateOfExpiry',
  'captain.dateOfBirth',
  'captain.passportExpiry',
  'trip.departureDate',
  'trip.returnDate'
];

/**
 * Check if a data source is a full date source (returns complete date object)
 * @param {string} dataSource - The data source path (e.g., 'traveler.dateOfBirth')
 * @returns {boolean} True if this is a full date source
 */
function isFullDateSource(dataSource) {
  return FULL_DATE_SOURCES.includes(dataSource);
}

/**
 * Field types for explicit admin selection
 */
const FIELD_TYPES = [
  { value: 'text', label: 'Text Input' },
  { value: 'date', label: 'Date (show format options)' },
  { value: 'dropdown', label: 'Dropdown/Select' }
];

/**
 * Set up admin mode functionality
 */
function setupAdminMode() {
  const scanBtn = document.getElementById('scanFieldsBtn');
  const saveBtn = document.getElementById('saveMappingBtn');
  const refreshBtn = document.getElementById('refreshMappingsBtn');
  
  if (scanBtn) {
    scanBtn.addEventListener('click', scanFormFields);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', saveMapping);
  }
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadExistingMappings);
  }
  
  // Load existing mappings when admin tab is shown
  loadExistingMappings();
}

/**
 * Load existing mappings for the current page URL
 */
async function loadExistingMappings() {
  const listContainer = document.getElementById('existingMappingsList');
  const emptyState = document.getElementById('existingMappingsEmpty');
  const loadingState = document.getElementById('existingMappingsLoading');
  
  if (!listContainer) return;
  
  // Show loading state
  listContainer.innerHTML = '';
  emptyState?.classList.add('hidden');
  loadingState?.classList.remove('hidden');
  
  try {
    // Get current tab URL
    const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
    const currentUrl = tabResult.tab?.url || '';
    
    // Fetch all mappings from the server
    const response = await fetch('https://crewforms.vercel.app/api/mappings');
    
    if (!response.ok) {
      throw new Error('Failed to fetch mappings');
    }
    
    const data = await response.json();
    const allMappings = data.mappings || [];
    
    // Filter mappings that match the current URL
    const matchingMappings = allMappings.filter(mapping => 
      urlMatchesPattern(currentUrl, mapping.urlPattern)
    );
    
    loadingState?.classList.add('hidden');
    
    if (matchingMappings.length === 0) {
      emptyState?.classList.remove('hidden');
      return;
    }
    
    // Render the matching mappings
    renderExistingMappings(matchingMappings, currentUrl);
    
  } catch (error) {
    console.error('Failed to load mappings:', error);
    loadingState?.classList.add('hidden');
    emptyState?.classList.remove('hidden');
    showToast('Failed to load existing mappings', 'error');
  }
}

/**
 * Check if a URL matches a pattern (supports * wildcards)
 * Same logic as server-side matching
 */
function urlMatchesPattern(url, pattern) {
  if (!url || !pattern) return false;
  
  // Convert pattern to regex
  const regexPattern = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  
  const regex = new RegExp(`^${regexPattern}$`, 'i');
  return regex.test(url);
}

/**
 * Render the list of existing mappings
 */
function renderExistingMappings(mappings, currentUrl) {
  const listContainer = document.getElementById('existingMappingsList');
  if (!listContainer) return;
  
  listContainer.innerHTML = mappings.map(mapping => `
    <div class="existing-mapping-item" data-id="${mapping.id}">
      <div class="mapping-info">
        <div class="mapping-name">${escapeHtml(mapping.name)}</div>
        <div class="mapping-meta">
          <span class="mapping-fields">${mapping.fieldCount} fields</span>
          <span class="mapping-version">v${mapping.version}</span>
        </div>
        <div class="mapping-url" title="${escapeHtml(mapping.urlPattern)}">${escapeHtml(mapping.urlPattern)}</div>
      </div>
      <div class="mapping-actions">
        <button class="btn btn-sm btn-secondary btn-edit-mapping" data-id="${mapping.id}" title="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-sm btn-danger btn-delete-mapping" data-id="${mapping.id}" data-name="${escapeHtml(mapping.name)}" title="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // Add event listeners for edit/delete buttons
  listContainer.querySelectorAll('.btn-edit-mapping').forEach(btn => {
    btn.addEventListener('click', () => {
      const mappingId = btn.dataset.id;
      editExistingMapping(mappingId);
    });
  });
  
  listContainer.querySelectorAll('.btn-delete-mapping').forEach(btn => {
    btn.addEventListener('click', () => {
      const mappingId = btn.dataset.id;
      const mappingName = btn.dataset.name;
      deleteExistingMapping(mappingId, mappingName);
    });
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Edit an existing mapping - loads it into the editor
 */
async function editExistingMapping(mappingId) {
  try {
    showToast('Loading mapping...', 'info');
    
    // Fetch the full mapping details
    console.log('Fetching mapping:', mappingId);
    const response = await fetch(`https://crewforms.vercel.app/api/mappings?id=${mappingId}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Mapping fetch failed:', response.status, errorText);
      throw new Error(`Failed to fetch mapping: ${response.status}`);
    }
    
    const mapping = await response.json();
    console.log('Loaded mapping:', mapping);
    
    // First scan the fields to get current page structure
    const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
    if (!tabResult.success || !tabResult.tab) {
      console.error('Could not get active tab:', tabResult);
      showToast('Could not detect active tab', 'error');
      return;
    }
    
    console.log('Scanning fields on tab:', tabResult.tab.id);
    
    // Try to scan fields - use sendMessage through background to ensure content script is injected
    let result;
    try {
      result = await chrome.tabs.sendMessage(tabResult.tab.id, {
        type: 'SCAN_FORM_FIELDS'
      });
    } catch (scanError) {
      console.log('Direct message failed, trying via background:', scanError.message);
      // Content script might not be loaded, try via background which will inject it
      result = await sendMessage({ 
        type: 'SCAN_FIELDS_ON_TAB',
        tabId: tabResult.tab.id
      });
    }
    
    if (!result || !result.success || !result.fields) {
      console.error('Field scan failed:', result);
      showToast('Could not scan form fields. Make sure you are on a form page.', 'error');
      return;
    }
    
    console.log('Scanned fields:', result.fields.length);
    
    // Store scanned fields
    state.scannedFields = result.fields;
    state.fieldConfigs = {};
    state.editingMappingId = mappingId; // Track that we're editing an existing mapping
    
    // Initialize field configs with defaults
    result.fields.forEach(field => {
      state.fieldConfigs[field.position] = {
        status: 'unmapped',
        dataSource: '',
        staticValue: '',
        inputType: 'paste',
        fieldType: 'text',
        dateFormat: '',
        keypressMap: {},
        keypressDelay: 100
      };
    });
    
    // Apply the saved mapping config to fields
    console.log('Applying saved field configs:', mapping.fields);
    
    mapping.fields.forEach(savedField => {
      console.log('Loading field:', savedField.position, savedField);
      
      if (state.fieldConfigs[savedField.position]) {
        // Determine status: use saved status, or infer from data
        let status = savedField.status;
        if (!status) {
          // Fallback: infer status if not explicitly saved
          status = savedField.staticValue ? 'static' : (savedField.dataSource ? 'data' : 'unmapped');
        }
        
        state.fieldConfigs[savedField.position] = {
          status: status,
          dataSource: savedField.dataSource || '',
          staticValue: savedField.staticValue || '',
          inputType: savedField.inputType || 'paste',
          fieldType: savedField.fieldType || 'text',
          dateFormat: savedField.dateFormat || '',
          keypressMap: savedField.config?.keypressMap || {},
          keypressDelay: savedField.config?.keypressDelay || 100
        };
        
        console.log('Applied config for field', savedField.position, ':', state.fieldConfigs[savedField.position]);
      } else {
        console.warn('Field position not found in scanned fields:', savedField.position);
      }
    });
    
    // Update URL pattern and mapping name
    const mappingUrl = document.getElementById('mappingUrl');
    const mappingName = document.getElementById('mappingName');
    const mappingFormType = document.getElementById('mappingFormType');
    const mappingFillDelay = document.getElementById('mappingFillDelay');
    
    if (mappingUrl) mappingUrl.value = mapping.urlPattern;
    if (mappingName) mappingName.value = mapping.name;
    if (mappingFormType) mappingFormType.value = mapping.formType;
    if (mappingFillDelay) mappingFillDelay.value = mapping.fillDelay || 100;
    
    // Show the field list UI
    document.getElementById('adminEmptyState')?.classList.add('hidden');
    document.getElementById('adminFieldList')?.classList.remove('hidden');
    document.getElementById('mappingNameSection')?.classList.remove('hidden');
    document.getElementById('saveMappingBtn').disabled = false;
    
    // Update field count
    const fieldCount = document.getElementById('fieldCount');
    if (fieldCount) {
      fieldCount.textContent = `${result.fields.length} fields found`;
    }
    
    // Render the field list with the loaded configs
    renderFieldList();
    
    showToast(`Loaded mapping: ${mapping.name}`, 'success');
    
  } catch (error) {
    console.error('Failed to edit mapping:', error);
    showToast(`Failed to load mapping: ${error.message}`, 'error');
  }
}

/**
 * Delete an existing mapping
 */
async function deleteExistingMapping(mappingId, mappingName) {
  // Confirm deletion
  if (!confirm(`Are you sure you want to delete the mapping "${mappingName}"?\n\nThis action cannot be undone.`)) {
    return;
  }
  
  try {
    const response = await fetch(`https://crewforms.vercel.app/api/mappings?id=${mappingId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete mapping');
    }
    
    showToast(`Deleted mapping: ${mappingName}`, 'success');
    
    // Refresh the list
    loadExistingMappings();
    
  } catch (error) {
    console.error('Failed to delete mapping:', error);
    showToast('Failed to delete mapping', 'error');
  }
}

/**
 * Scan form fields on the current page
 */
async function scanFormFields() {
  console.log('Scanning form fields...');
  
  // Get the active tab
  const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
  
  if (!tabResult.success || !tabResult.tab) {
    showToast('Could not detect active tab', 'error');
    return;
  }
  
  // Check if we can scan this page
  const url = tabResult.tab.url;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    showToast('Cannot scan this page type', 'warning');
    return;
  }
  
  try {
    // Send scan message to content script via background
    const result = await chrome.tabs.sendMessage(tabResult.tab.id, {
      type: 'SCAN_FORM_FIELDS'
    });
    
    if (result.success && result.fields) {
      state.scannedFields = result.fields;
      state.fieldConfigs = {};
      
      // Initialize default configs for each field
      result.fields.forEach(field => {
        state.fieldConfigs[field.position] = {
          status: 'unmapped',
          dataSource: '',
          staticValue: '',
          inputType: 'paste',
          fieldType: 'text', // Explicit field type: text, date, dropdown
          dateFormat: '',
          keypressMap: {},
          keypressDelay: 100 // Default delay between keystrokes in ms
        };
      });
      
      // Update URL pattern
      const mappingUrl = document.getElementById('mappingUrl');
      if (mappingUrl) {
        // Extract base URL pattern
        const urlObj = new URL(url);
        mappingUrl.value = `${urlObj.origin}${urlObj.pathname}*`;
      }
      
      // Show the field list and mapping name section
      document.getElementById('adminEmptyState').classList.add('hidden');
      document.getElementById('adminFieldList').classList.remove('hidden');
      document.getElementById('mappingNameSection').classList.remove('hidden');
      document.getElementById('saveMappingBtn').disabled = false;
      
      // Render the field list
      renderFieldList();
      
      showToast(`Found ${result.fields.length} fields`, 'success');
    } else {
      showToast('No form fields found on this page', 'warning');
    }
  } catch (error) {
    console.error('Scan error:', error);
    // Content script might not be loaded, try injecting it
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabResult.tab.id },
        files: ['content/content-script.js']
      });
      
      // Wait a moment and retry
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await chrome.tabs.sendMessage(tabResult.tab.id, {
        type: 'SCAN_FORM_FIELDS'
      });
      
      if (result.success && result.fields) {
        state.scannedFields = result.fields;
        // ... same processing as above
        showToast(`Found ${result.fields.length} fields`, 'success');
        renderFieldList();
      }
    } catch (injectError) {
      showToast('Could not scan page: ' + error.message, 'error');
    }
  }
}

/**
 * Render the list of scanned fields
 */
function renderFieldList() {
  const container = document.getElementById('fieldListContainer');
  const countEl = document.getElementById('fieldCount');
  
  if (!container) return;
  
  const fields = state.scannedFields;
  countEl.textContent = `${fields.length} fields found`;
  
  // Debug: log field configs before rendering
  console.log('Rendering field list. Field configs:', JSON.stringify(state.fieldConfigs, null, 2));
  
  container.innerHTML = fields.map(field => renderFieldItem(field)).join('');
  
  // Add event listeners for field status changes
  container.querySelectorAll('.field-status').forEach(select => {
    select.addEventListener('change', handleFieldStatusChange);
  });
  
  // Add event listeners for data source changes
  container.querySelectorAll('.data-source-select').forEach(select => {
    select.addEventListener('change', handleDataSourceChange);
  });
  
  // Add event listeners for other config changes
  container.querySelectorAll('.static-value-input').forEach(input => {
    input.addEventListener('input', handleStaticValueChange);
  });
  
  container.querySelectorAll('.input-behavior-select').forEach(select => {
    select.addEventListener('change', handleInputBehaviorChange);
  });
  
  container.querySelectorAll('.date-format-select').forEach(select => {
    select.addEventListener('change', handleDateFormatChange);
  });
  
  // Add event listeners for field type selector
  container.querySelectorAll('.field-type-select').forEach(select => {
    select.addEventListener('change', handleFieldTypeChange);
  });
  
  // Add event listeners for keypress map builder buttons (using event delegation)
  container.querySelectorAll('.add-keypress').forEach(btn => {
    btn.addEventListener('click', () => {
      const entriesContainer = btn.closest('.keypress-config').querySelector('.keypress-entries');
      const position = parseInt(entriesContainer.dataset.position);
      addKeypressEntry(position);
    });
  });
  
  container.querySelectorAll('.btn-remove-keypress').forEach(btn => {
    btn.addEventListener('click', () => {
      const position = parseInt(btn.dataset.position);
      const index = parseInt(btn.dataset.index);
      removeKeypressEntry(position, index);
    });
  });
  
  // Add event listeners for keypress delay inputs
  container.querySelectorAll('.keypress-delay').forEach(input => {
    input.addEventListener('change', (e) => {
      const position = parseInt(e.target.dataset.position);
      const delay = parseInt(e.target.value) || 100;
      state.fieldConfigs[position].keypressDelay = delay;
    });
  });
  
  // Add event listeners for test buttons
  container.querySelectorAll('.btn-test').forEach(btn => {
    btn.addEventListener('click', () => {
      const position = parseInt(btn.dataset.position);
      testField(position);
    });
  });
  
  // Add event listeners for test value inputs
  container.querySelectorAll('.test-value-input').forEach(input => {
    input.addEventListener('input', handleTestValueChange);
  });
}

/**
 * Render a single field item
 */
function renderFieldItem(field) {
  const config = state.fieldConfigs[field.position] || {};
  // Ensure status has a default value
  const status = config.status || 'unmapped';
  const isDisabled = field.isDisabled;
  const isMapped = status === 'data' || status === 'static';
  
  // Debug log for each field being rendered
  if (status !== 'unmapped') {
    console.log(`Rendering field #${field.position} with status: ${status}`);
  }
  
  // Pass the normalized status to config for renderFieldConfigDetails
  const configWithStatus = { ...config, status };
  
  return `
    <div class="field-item ${status === 'ignore' ? 'ignore' : ''}" data-position="${field.position}">
      <div class="field-header">
        <span class="field-position">#${field.position}</span>
        <span class="field-label">${field.label || field.name || field.formControlName || 'Unlabeled'}</span>
        <span class="field-type ${isDisabled ? 'disabled' : ''}">${field.type}${isDisabled ? ' (disabled)' : ''}</span>
        ${isMapped ? `<button class="btn btn-sm btn-test" data-position="${field.position}" title="Test this field">Test</button>` : ''}
      </div>
      <div class="field-config">
        <div class="field-config-row">
          <select class="field-status" data-position="${field.position}">
            <option value="unmapped" ${status === 'unmapped' ? 'selected' : ''}>Unmapped</option>
            <option value="ignore" ${status === 'ignore' ? 'selected' : ''}>Ignore</option>
            <option value="data" ${status === 'data' ? 'selected' : ''}>Map to Data</option>
            <option value="static" ${status === 'static' ? 'selected' : ''}>Static Value</option>
          </select>
        </div>
        ${renderFieldConfigDetails(field, configWithStatus)}
      </div>
    </div>
  `;
}

/**
 * Render configuration details based on field status
 */
function renderFieldConfigDetails(field, config) {
  if (config.status === 'unmapped' || config.status === 'ignore') {
    return '';
  }
  
  let html = '<div class="field-config-details">';
  
  // Data source selector (for status = 'data')
  if (config.status === 'data') {
    html += `
      <div class="config-group">
        <label>Data Source</label>
        <select class="data-source-select" data-position="${field.position}">
          <option value="">-- Select Data Source --</option>
          <optgroup label="Traveler">
            ${DATA_SOURCES.traveler.map(s => 
              `<option value="${s.value}" ${config.dataSource === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </optgroup>
          <optgroup label="Captain">
            ${DATA_SOURCES.captain.map(s => 
              `<option value="${s.value}" ${config.dataSource === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </optgroup>
          <optgroup label="Boat">
            ${DATA_SOURCES.boat.map(s => 
              `<option value="${s.value}" ${config.dataSource === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </optgroup>
          <optgroup label="Company">
            ${DATA_SOURCES.company.map(s => 
              `<option value="${s.value}" ${config.dataSource === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </optgroup>
          <optgroup label="Trip">
            ${DATA_SOURCES.trip.map(s => 
              `<option value="${s.value}" ${config.dataSource === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('')}
          </optgroup>
        </select>
      </div>
    `;
  }
  
  // Static value input (for status = 'static')
  if (config.status === 'static') {
    html += `
      <div class="config-group">
        <label>Static Value</label>
        <input type="text" class="static-value-input" data-position="${field.position}" 
               value="${config.staticValue || ''}" placeholder="Enter fixed value">
      </div>
    `;
  }
  
  // Field type selector (explicit admin selection)
  html += `
    <div class="config-group">
      <label>Field Type</label>
      <select class="field-type-select" data-position="${field.position}">
        ${FIELD_TYPES.map(t => 
          `<option value="${t.value}" ${config.fieldType === t.value ? 'selected' : ''}>${t.label}</option>`
        ).join('')}
      </select>
    </div>
  `;
  
  // Input behavior selector (for both data and static)
  html += `
    <div class="config-group">
      <label>Input Behavior</label>
      <select class="input-behavior-select" data-position="${field.position}">
        ${INPUT_BEHAVIORS.map(b => 
          `<option value="${b.value}" ${config.inputType === b.value ? 'selected' : ''}>${b.label}</option>`
        ).join('')}
      </select>
    </div>
  `;
  
  // Date format selector - shown when:
  // 1. fieldType is explicitly set to 'date', OR
  // 2. A full date source is selected (auto-detected)
  const showDateFormat = config.fieldType === 'date' || isFullDateSource(config.dataSource);
  if (showDateFormat) {
    html += `
      <div class="config-group">
        <label>Date Format</label>
        <select class="date-format-select" data-position="${field.position}">
          <option value="">-- Select Format --</option>
          ${DATE_FORMATS.map(f => 
            `<option value="${f.value}" ${config.dateFormat === f.value ? 'selected' : ''}>${f.label}</option>`
          ).join('')}
        </select>
      </div>
    `;
  }
  
  // Test value input (for paste behavior - allows manual test value entry)
  if (config.inputType === 'paste' || !config.inputType) {
    html += `
      <div class="config-group">
        <label>Test Value (for testing paste)</label>
        <input type="text" class="test-value-input" data-position="${field.position}" 
               value="${config.testValue || ''}" placeholder="Enter a value to test with">
      </div>
    `;
  }
  
  // Keypress map builder (for select-keypress behavior)
  if (config.inputType === 'select-keypress') {
    html += renderKeypressMapBuilder(field.position, config.keypressMap || {});
  }
  
  html += '</div>';
  return html;
}

/**
 * Render keypress map builder UI
 */
function renderKeypressMapBuilder(position, keypressMap) {
  const entries = Object.entries(keypressMap);
  // Get current delay from field config, default to 100ms
  const currentDelay = state.fieldConfigs[position]?.keypressDelay || 100;
  
  return `
    <div class="config-group">
      <label>Keypress Navigation Map</label>
      <div class="keypress-config">
        <p>Define keystroke sequence (executes all rows in order):</p>
        <div class="keypress-entries" data-position="${position}">
          ${entries.length > 0 ? entries.map(([value, config], index) => `
            <div class="keypress-entry" data-index="${index}">
              <input type="text" class="keypress-value" value="${value}" placeholder="Label (e.g., step1)">
              <select class="keypress-key-select">
                <option value="">-- Key --</option>
                <optgroup label="Letters">
                  ${['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z']
                    .map(k => `<option value="${k}" ${config.key === k ? 'selected' : ''}>${k.toUpperCase()}</option>`).join('')}
                </optgroup>
                <optgroup label="Special Keys">
                  <option value="Enter" ${config.key === 'Enter' ? 'selected' : ''}>Enter</option>
                  <option value="Tab" ${config.key === 'Tab' ? 'selected' : ''}>Tab</option>
                  <option value="ArrowDown" ${config.key === 'ArrowDown' ? 'selected' : ''}>Arrow Down</option>
                  <option value="ArrowUp" ${config.key === 'ArrowUp' ? 'selected' : ''}>Arrow Up</option>
                  <option value="ArrowLeft" ${config.key === 'ArrowLeft' ? 'selected' : ''}>Arrow Left</option>
                  <option value="ArrowRight" ${config.key === 'ArrowRight' ? 'selected' : ''}>Arrow Right</option>
                  <option value="Space" ${config.key === 'Space' || config.key === ' ' ? 'selected' : ''}>Space</option>
                  <option value="Escape" ${config.key === 'Escape' ? 'selected' : ''}>Escape</option>
                  <option value="Backspace" ${config.key === 'Backspace' ? 'selected' : ''}>Backspace</option>
                </optgroup>
              </select>
              <input type="number" class="keypress-count" value="${config.count || 1}" placeholder="#" min="1" title="Repeat count">
              <button type="button" class="btn-remove-keypress" data-position="${position}" data-index="${index}">×</button>
            </div>
          `).join('') : ''}
        </div>
        <button type="button" class="btn btn-sm btn-secondary add-keypress">+ Add Entry</button>
        <div class="keypress-delay-config">
          <label for="keypressDelay-${position}">Delay between keystrokes (ms):</label>
          <input type="number" 
                 id="keypressDelay-${position}" 
                 class="keypress-delay" 
                 data-position="${position}"
                 value="${currentDelay}" 
                 placeholder="100" 
                 min="0" 
                 max="2000"
                 step="50">
        </div>
      </div>
    </div>
  `;
}

/**
 * Handle field status change
 */
function handleFieldStatusChange(event) {
  const position = parseInt(event.target.dataset.position);
  const status = event.target.value;
  
  state.fieldConfigs[position].status = status;
  
  // Reset dependent values when status changes
  if (status === 'unmapped' || status === 'ignore') {
    state.fieldConfigs[position].dataSource = '';
    state.fieldConfigs[position].staticValue = '';
  }
  
  // Re-render the field list to update config details
  renderFieldList();
}

/**
 * Handle data source change
 */
function handleDataSourceChange(event) {
  const position = parseInt(event.target.dataset.position);
  const dataSource = event.target.value;
  state.fieldConfigs[position].dataSource = dataSource;
  
  // Auto-set fieldType to 'date' when a full date source is selected
  // This triggers the date format picker to appear
  if (isFullDateSource(dataSource)) {
    state.fieldConfigs[position].fieldType = 'date';
  }
  
  // Re-render to show/hide date format based on data source
  renderFieldList();
}

/**
 * Handle static value change
 */
function handleStaticValueChange(event) {
  const position = parseInt(event.target.dataset.position);
  state.fieldConfigs[position].staticValue = event.target.value;
}

/**
 * Handle input behavior change
 */
function handleInputBehaviorChange(event) {
  const position = parseInt(event.target.dataset.position);
  state.fieldConfigs[position].inputType = event.target.value;
  
  // Re-render to show/hide keypress map builder
  renderFieldList();
}

/**
 * Handle date format change
 */
function handleDateFormatChange(event) {
  const position = parseInt(event.target.dataset.position);
  state.fieldConfigs[position].dateFormat = event.target.value;
}

/**
 * Handle field type change
 */
function handleFieldTypeChange(event) {
  const position = parseInt(event.target.dataset.position);
  state.fieldConfigs[position].fieldType = event.target.value;
  
  // Re-render to show/hide date format picker
  renderFieldList();
}

/**
 * Handle test value change
 */
function handleTestValueChange(event) {
  const position = parseInt(event.target.dataset.position);
  state.fieldConfigs[position].testValue = event.target.value;
}

/**
 * Add a keypress entry
 */
function addKeypressEntry(position) {
  if (!state.fieldConfigs[position].keypressMap) {
    state.fieldConfigs[position].keypressMap = {};
  }
  
  // Add empty entry with unique key
  const newKey = `value_${Date.now()}`;
  state.fieldConfigs[position].keypressMap[newKey] = { key: '', count: 1 };
  
  renderFieldList();
}

/**
 * Remove a keypress entry
 */
function removeKeypressEntry(position, index) {
  const entries = Object.entries(state.fieldConfigs[position].keypressMap || {});
  if (entries[index]) {
    delete state.fieldConfigs[position].keypressMap[entries[index][0]];
  }
  renderFieldList();
}

/**
 * Collect keypress map values before saving
 * Reads from the key select dropdown (supports special keys like Enter)
 */
function collectKeypressMaps() {
  document.querySelectorAll('.keypress-entries').forEach(container => {
    const position = parseInt(container.dataset.position);
    const newMap = {};
    
    container.querySelectorAll('.keypress-entry').forEach((entry, index) => {
      const value = entry.querySelector('.keypress-value').value.trim();
      // Read from select dropdown instead of text input
      const keySelect = entry.querySelector('.keypress-key-select');
      const key = keySelect ? keySelect.value : '';
      const count = parseInt(entry.querySelector('.keypress-count').value) || 1;
      
      if (key) {
        // Use index-based key if no label provided (ensures all entries are captured)
        const mapKey = value || `step_${index}`;
        newMap[mapKey] = { key, count };
      }
    });
    
    state.fieldConfigs[position].keypressMap = newMap;
  });
}

/**
 * Save the mapping to the server
 */
async function saveMapping() {
  const mappingName = document.getElementById('mappingName').value.trim();
  const mappingUrl = document.getElementById('mappingUrl').value.trim();
  const formType = document.getElementById('mappingFormType').value;
  const fillDelay = parseInt(document.getElementById('mappingFillDelay').value) || 100;
  
  if (!mappingName) {
    showToast('Please enter a mapping name', 'warning');
    return;
  }
  
  if (!mappingUrl) {
    showToast('URL pattern is required', 'warning');
    return;
  }
  
  // Collect keypress map values from DOM
  collectKeypressMaps();
  
  // Build the fields array from configs
  const fields = [];
  
  for (const [posStr, config] of Object.entries(state.fieldConfigs)) {
    const position = parseInt(posStr);
    
    // Skip unmapped and ignored fields
    if (config.status === 'unmapped' || config.status === 'ignore') {
      continue;
    }
    
    const fieldMapping = {
      position,
      status: config.status,
      inputType: config.inputType || 'paste'
    };
    
    if (config.status === 'data') {
      fieldMapping.dataSource = config.dataSource;
    }
    
    if (config.status === 'static') {
      fieldMapping.staticValue = config.staticValue;
    }
    
    if (config.dateFormat) {
      fieldMapping.dateFormat = config.dateFormat;
    }
    
    if (config.inputType === 'select-keypress' && Object.keys(config.keypressMap || {}).length > 0) {
      fieldMapping.config = { 
        keypressMap: config.keypressMap,
        keypressDelay: config.keypressDelay || 100 // Delay between keystrokes in ms
      };
    }
    
    fields.push(fieldMapping);
  }
  
  if (fields.length === 0) {
    showToast('No fields mapped. Please map at least one field.', 'warning');
    return;
  }
  
  // Check if we're editing an existing mapping or creating new
  const isEditing = !!state.editingMappingId;
  
  // Create the mapping object
  const mapping = {
    id: isEditing ? state.editingMappingId : generateId(),
    name: mappingName,
    urlPattern: mappingUrl,
    formType,
    fillDelay,
    fields
  };
  
  console.log(isEditing ? 'Updating mapping:' : 'Saving mapping:', mapping);
  
  try {
    // Send to the API - use PUT for updates, POST for new
    const response = await fetch('https://crewforms.vercel.app/api/mappings', {
      method: isEditing ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(mapping)
    });
    
    if (response.ok) {
      showToast(isEditing ? 'Mapping updated successfully!' : 'Mapping saved successfully!', 'success');
      
      // Clear the form and editing state
      state.scannedFields = [];
      state.fieldConfigs = {};
      state.editingMappingId = null; // Clear editing state
      document.getElementById('mappingName').value = '';
      document.getElementById('mappingUrl').value = '';
      document.getElementById('adminEmptyState').classList.remove('hidden');
      document.getElementById('adminFieldList').classList.add('hidden');
      document.getElementById('mappingNameSection').classList.add('hidden');
      document.getElementById('saveMappingBtn').disabled = true;
      
      // Refresh the existing mappings list
      loadExistingMappings();
    } else {
      const error = await response.json();
      showToast('Failed to save: ' + (error.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Save error:', error);
    showToast('Failed to save mapping: ' + error.message, 'error');
  }
}

/**
 * Test filling a single field
 */
async function testField(position) {
  const config = state.fieldConfigs[position];
  
  if (!config || (config.status !== 'data' && config.status !== 'static')) {
    showToast('Field is not mapped', 'warning');
    return;
  }
  
  // Get the active tab
  const tabResult = await sendMessage({ type: 'GET_ACTIVE_TAB' });
  
  if (!tabResult.success || !tabResult.tab) {
    showToast('Could not detect active tab', 'error');
    return;
  }
  
  // Collect any unsaved keypress map values from the DOM
  collectKeypressMaps();
  
  const inputType = config.inputType || 'paste';
  
  // Determine the value to fill based on input behavior
  let value = null;
  let useKeystrokes = false;
  
  if (inputType === 'select-keypress') {
    // For keypress navigation, just execute the keystrokes directly
    const keypressEntries = Object.entries(config.keypressMap || {});
    if (keypressEntries.length > 0) {
      useKeystrokes = true;
      // Value is optional for keypress - we just execute the keystrokes
      value = keypressEntries[0][0]; // Pass the target value for reference
    } else {
      showToast('Add at least one keypress entry to test', 'warning');
      return;
    }
  } else if (config.status === 'static') {
    // Static value
    value = config.staticValue;
  } else if (inputType === 'paste' || inputType === 'text') {
    // For paste behavior, use the test value input
    value = config.testValue;
    if (!value) {
      // Fallback to data source
      value = getTestDataForField(config.dataSource);
    }
  } else {
    // For select-match, click-select, use test value or data source
    value = config.testValue || getTestDataForField(config.dataSource);
  }
  
  if (!useKeystrokes && (value === undefined || value === null || value === '')) {
    showToast('Enter a test value to test this field', 'warning');
    return;
  }
  
  try {
    // Send test fill message to content script
    const result = await chrome.tabs.sendMessage(tabResult.tab.id, {
      type: 'TEST_FILL_FIELD',
      position,
      value,
      config: {
        inputType,
        dateFormat: config.dateFormat,
        keypressMap: config.keypressMap,
        keypressDelay: config.keypressDelay || 100, // Delay between keystrokes in ms
        useKeystrokes // Flag to indicate keystrokes should be executed
      }
    });
    
    if (result.success) {
      showToast(`Field #${position} filled successfully`, 'success');
    } else {
      showToast('Failed to fill field: ' + (result.error || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('Test fill error:', error);
    showToast('Could not test field: ' + error.message, 'error');
  }
}

/**
 * Get test data for a data source path
 * Uses current state (travelers, captain, boat, etc.)
 */
function getTestDataForField(dataSource) {
  if (!dataSource) return null;
  
  const parts = dataSource.split('.');
  const sourceType = parts[0]; // traveler, captain, boat, etc.
  const fieldPath = parts.slice(1).join('.');
  
  let sourceData;
  
  switch (sourceType) {
    case 'traveler':
      // Use first traveler as test data
      sourceData = state.travelers[0];
      break;
    case 'captain':
      sourceData = state.captain;
      break;
    case 'boat':
      // Use first boat or selected boat from trip
      sourceData = state.boats[0];
      break;
    case 'company':
      sourceData = state.companies[0];
      break;
    case 'trip':
      sourceData = state.trips[0];
      break;
    default:
      return null;
  }
  
  if (!sourceData) return null;
  
  // Navigate the field path
  let value = sourceData;
  for (const part of fieldPath.split('.')) {
    if (value === null || value === undefined) return null;
    value = value[part];
  }
  
  return value;
}

// ============================================================================
// EXPORT FOR DEBUGGING
// ============================================================================

window.crewforms = {
  state,
  loadAllData,
  renderAll,
  scanFormFields,
  DATA_SOURCES
};

