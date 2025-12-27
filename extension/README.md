# CrewForms Chrome Extension

A Chrome extension for boat captains to auto-fill guest passport information into government/port authority websites.

## Installation (Development)

1. **Generate Icons** (one-time setup):
   - Open `icons/generate-icons.html` in a browser
   - Right-click each canvas and save as the indicated filename (icon16.png, icon32.png, icon48.png, icon128.png)
   - Save them in the `icons/` folder

2. **Load Extension in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked"
   - Select the `extension` folder

3. **Test**:
   - Click the CrewForms icon in your toolbar
   - The side panel should open

## Project Structure

```
extension/
├── manifest.json          # Extension manifest (Manifest V3)
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   └── content-script.js  # Content script for form filling
├── sidepanel/
│   ├── index.html         # Side panel HTML
│   ├── styles.css         # Side panel styles
│   └── app.js             # Side panel JavaScript
└── icons/
    ├── generate-icons.html # Icon generator
    └── *.png               # Icon files (generated)
```

## Features

### Sprint 1 (Complete)
- ✅ Chrome extension manifest (Manifest V3)
- ✅ Side panel registration
- ✅ Background service worker
- ✅ Tab navigation UI
- ✅ Captain data form
- ✅ Boat management (CRUD)
- ✅ Company management (CRUD)
- ✅ Trip management with expiry
- ✅ Local storage system
- ✅ Content script for form detection

### Sprint 2 (Planned)
- Session management for image uploads
- QR code generation
- Mobile upload page
- Image relay system
- OCR integration
- Traveler data display

### Sprint 3 (Planned)
- Field mapping system
- Form filling engine
- Input type handlers
- Dynamic form support

### Sprint 4 (Planned)
- Admin interface
- Error handling improvements
- Auto-expiry enforcement
- Production hardening

## Data Storage

| Data Type | Retention | Location |
|-----------|-----------|----------|
| Captain info | Indefinite | Browser local storage |
| Boats | Indefinite | Browser local storage |
| Companies | Indefinite | Browser local storage |
| Trips | 12 hours | Browser local storage |
| Travelers | 12 hours | Browser local storage |
| Passport images | 12 hours | Browser local storage |

## Server Requirements

The extension requires a server running at `http://localhost:3000` (configurable) for:
- Session management
- Image relay
- OCR proxy
- Field mapping distribution

See the main project's server documentation for setup instructions.

