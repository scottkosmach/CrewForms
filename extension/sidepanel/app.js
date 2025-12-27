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
  editingCompanyId: null
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
  
  // Update UI
  renderAll();
  
  // Start expiry timer update
  startExpiryTimer();
  
  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);
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
  console.log('Side panel received:', message.type);
  
  switch (message.type) {
    case 'DATA_EXPIRED':
      // Reload data and update UI
      loadAllData().then(() => renderAll());
      showToast('Some data has expired and been cleared', 'warning');
      break;
    
    case 'IMAGE_RECEIVED':
      // New passport image received from upload
      console.log('Received image from background!');
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
  // Create a new traveler entry with the image
  const travelerId = generateId();
  
  // Store image separately (large data)
  state.travelerImages[travelerId] = {
    data: imageData,
    expiresAt: getExpiryTime()
  };
  
  // Create traveler placeholder
  const traveler = {
    id: travelerId,
    firstName: '',
    lastName: '',
    status: 'processing', // 'processing', 'ready', 'error'
    expiresAt: getExpiryTime()
  };
  
  state.travelers.push(traveler);
  
  // Save to storage
  setStorage({
    travelers: state.travelers,
    travelerImages: state.travelerImages
  });
  
  // Render updated list
  renderTravelerList();
  
  // Trigger OCR processing
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
          <div class="traveler-info">
            <div class="traveler-name">
              ${traveler.status === 'processing' ? 'Processing...' : 
                traveler.status === 'error' ? 'Error - Click to retry' :
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
            <button class="btn btn-sm btn-danger delete-traveler" data-id="${traveler.id}">×</button>
          </div>
        </div>
        <div class="traveler-card-body">
          ${imageData ? `<img class="traveler-image-full" src="${imageData.data}" alt="Passport">` : ''}
          <div class="traveler-fields">
            <div class="traveler-field">
              <div class="traveler-field-label">First Name</div>
              <div class="traveler-field-value">${traveler.firstName || '-'}</div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Last Name</div>
              <div class="traveler-field-value">${traveler.lastName || '-'}</div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Passport #</div>
              <div class="traveler-field-value">${traveler.passportNumber || '-'}</div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Nationality</div>
              <div class="traveler-field-value">${traveler.nationality || '-'}</div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Date of Birth</div>
              <div class="traveler-field-value">
                ${formatDateObj(traveler.dateOfBirth)}
              </div>
            </div>
            <div class="traveler-field">
              <div class="traveler-field-label">Gender</div>
              <div class="traveler-field-value">${traveler.gender || '-'}</div>
            </div>
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
  
  list.querySelectorAll('.delete-traveler').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTraveler(btn.dataset.id);
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
    card.classList.toggle('expanded');
    const btn = card.querySelector('.toggle-traveler');
    btn.textContent = card.classList.contains('expanded') ? 'Hide' : 'Details';
  }
}

async function deleteTraveler(id) {
  if (!confirm('Are you sure you want to delete this traveler?')) return;
  
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
    
    // Send fill command
    const fillResult = await sendMessage({
      type: 'FILL_FORM',
      tabId: tabResult.tab.id,
      data,
      mapping: mappingResult.mapping
    });
    
    if (fillResult.success) {
      showToast(`Filled ${fillResult.filledCount} fields`, 'success');
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
// EXPORT FOR DEBUGGING
// ============================================================================

window.crewforms = {
  state,
  loadAllData,
  renderAll
};

