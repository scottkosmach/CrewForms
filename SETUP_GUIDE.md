# CrewForms Setup Guide

Complete setup instructions for the CrewForms application.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Chrome Extension Setup](#chrome-extension-setup)
4. [Server Configuration](#server-configuration)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Authentication Setup](#authentication-setup)

---

## Authentication Setup

CrewForms uses Supabase Auth for user accounts (email/password + Google).
Signed-in users get their extension data (boats, companies, trips, travelers,
captain profile, passport images) synced to their account across computers.
These are one-time dashboard steps:

### 1. Apply the database migration

```bash
npx supabase db push
```

(or paste `supabase/migrations/20260807000000_user_data_tables.sql` into the
Supabase SQL editor). This creates the per-user sync tables with RLS, the
private `traveler-images` bucket, and removes the over-permissive `templates`
bucket policies.

### 2. Google Cloud Console (free, no verification review)

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project (e.g. "CrewForms").
2. **APIs & Services → OAuth consent screen**: External, app name "CrewForms",
   your support email. Scopes: `openid`, `email`, `profile` (non-sensitive).
   Publish the app.
3. **Credentials → Create Credentials → OAuth client ID**, type **Web application**:
   - Authorized JavaScript origins: `https://crewforms.vercel.app`, `http://localhost:3000`
   - Authorized redirect URI: the **Callback URL** shown in Supabase Dashboard →
     Authentication → Providers → Google (looks like
     `https://<project-ref>.supabase.co/auth/v1/callback`). This is the ONLY
     redirect Google needs — the extension's redirect is registered in Supabase, not Google.
4. Copy the Client ID and Client Secret.

### 3. Supabase Dashboard → Authentication

1. **Providers → Google**: enable, paste the Client ID + Secret.
2. **URL Configuration**:
   - Site URL: `https://crewforms.vercel.app`
   - Additional Redirect URLs:
     - `http://localhost:3000/**`
     - `https://crewforms.vercel.app/**`
     - `https://doolnbjkkkohibfnchfobpdpjeapjbjd.chromiumapp.org/*`
       (the extension's OAuth callback — its id is pinned by the `key` in
       `extension/manifest.json`, so it is identical on every machine)

### 4. Vercel environment

Add `ADMIN_EMAILS=<your email>` (comma-separated list allowed to write global
site mappings / Excel templates through the API).

### 5. Extension signing key

`extension-key.pem` in the repo root is the private key whose public half pins
the extension id. It is gitignored (`*.pem`) — **keep it safe and out of the
zip**; only the public `key` in `manifest.json` ships. If it is ever lost the
extension id changes and the redirect URL in step 3 must be updated.

---

## Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- **Chrome browser** (for extension)
- **OpenAI API key** (for OCR functionality)

---

## Installation

### 1. Clone and Install Dependencies

```bash
cd CrewForms
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
# Required for OCR
OPENAI_API_KEY=sk-your-openai-api-key

# Application URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 3. Start Development Server

```bash
npm run dev
```

The server will start at `http://localhost:3000`.

---

## Chrome Extension Setup

### 1. Generate Extension Icons

1. Open `extension/icons/generate-icons.html` in Chrome
2. Right-click each canvas and "Save image as..."
3. Save as `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` in the `extension/icons/` folder

### 2. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension` folder from this project

### 3. Test the Extension

1. Click the CrewForms icon in your Chrome toolbar
2. The side panel should open
3. Try adding captain, boat, and company information

---

## Server Configuration

### API Endpoints

The server provides these API endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | POST | Create upload session |
| `/api/sessions/[id]` | GET | Get session status |
| `/api/sessions/[id]/upload` | POST | Upload images |
| `/api/ocr` | POST | Process passport image |
| `/api/mappings` | GET/POST/PUT/DELETE | Manage field mappings |

### Admin Interface

Access the admin panel at `http://localhost:3000/admin` to:

- View all field mappings
- Create new mappings
- Edit existing mappings
- Delete mappings

### Mobile Upload Page

When a captain clicks "Import Guests" in the extension:

1. A QR code is generated with a unique session URL
2. Scanning opens `http://localhost:3000/upload/[sessionId]`
3. The mobile page allows multi-image upload
4. Images are relayed to the extension in real-time

---

## Testing

### Test the Extension

1. Open a webpage
2. Click the CrewForms extension icon
3. Navigate through tabs (Travelers, Captain, Boat, Company, Trip)
4. Enter and save data
5. Data should persist across browser sessions

### Test OCR (requires OpenAI API key)

1. Click "Import Guests" in the extension
2. A QR code should appear
3. Scan with your phone or navigate to the URL manually
4. Upload a passport image
5. The OCR should extract data and display it in the extension

### Test Form Filling

1. Navigate to a website matching a mapping URL pattern
2. Focus on a form field
3. Select a data source in the extension
4. Click "Paste"
5. Fields should be filled according to the mapping

---

## Production Deployment

### 1. Build the Application

```bash
npm run build
```

### 2. Deploy to Vercel (Recommended)

```bash
npx vercel
```

Or connect your Git repository to Vercel for automatic deployments.

### 3. Configure Production Environment

Set environment variables in your deployment platform:

- `OPENAI_API_KEY` - Your OpenAI API key
- `NEXT_PUBLIC_BASE_URL` - Your production URL

### 4. Update Extension Server URL

Edit `extension/background/service-worker.js`:

```javascript
const SERVER_URL = 'https://your-production-url.com';
```

### 5. Package Extension for Distribution

1. Zip the `extension` folder
2. Upload to Chrome Web Store (requires developer account)
3. Or distribute the zip file directly for sideloading

---

## Troubleshooting

### Extension not loading

- Ensure all icon files exist in `extension/icons/`
- Check Chrome's extension error console for details
- Verify manifest.json is valid JSON

### QR code not generating

- Check browser console for errors
- Verify server is running at configured URL
- Check network connectivity

### OCR not working

- Verify `OPENAI_API_KEY` is set correctly
- Check server logs for API errors
- Ensure image is clear and passport is visible

### Form filling not working

- Verify mapping exists for current URL
- Check that fields are visible and enabled
- Ensure focus is on a form field before clicking Paste

---

## Project Structure

```
CrewForms/
├── extension/               # Chrome extension
│   ├── manifest.json        # Extension manifest
│   ├── background/          # Service worker
│   ├── content/             # Content script
│   ├── sidepanel/           # Side panel UI
│   └── icons/               # Extension icons
├── src/
│   └── app/
│       ├── api/             # API routes
│       │   ├── sessions/    # Session management
│       │   ├── ocr/         # OCR proxy
│       │   └── mappings/    # Field mappings
│       ├── admin/           # Admin interface
│       └── upload/          # Mobile upload page
├── .env.example             # Environment template
├── package.json
└── SETUP_GUIDE.md           # This file
```

---

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review browser console logs
3. Check server logs for API errors

---

*Last updated: December 2024*
