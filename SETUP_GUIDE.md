# Project Setup Guide: Vercel + Supabase Template

A step-by-step guide to duplicate the template project and create new Vercel + Supabase environments.

---

## Prerequisites

- [Node.js](https://nodejs.org/) installed
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed (`npm install -g supabase`)
- [Vercel CLI](https://vercel.com/docs/cli) installed (`npm install -g vercel`) - optional
- GitHub account
- Supabase account
- Vercel account

---

## Step 1: Create New GitHub Repository

### Option A: Copy from Template
1. Copy the template folder to a new location
2. Rename the folder to your project name

### Option B: Clone Existing Repo
```bash
git clone https://github.com/scottkosmach/Template.git MyNewProject
cd MyNewProject
```

---

## Step 2: Update Project References

### 2.1 Update `package.json`
Change the name from `template-app` to your project name:
```json
{
  "name": "your-project-name",
  ...
}
```

### 2.2 Update `supabase/config.toml`
Change the project_id:
```toml
project_id = "YourProjectName"
```

---

## Step 3: Create GitHub Repository

1. Go to [github.com/new](https://github.com/new)
2. Create a new empty repository (e.g., `YourProjectName`)
3. Update the git remote and push:

```bash
# Remove old origin (if cloned from template)
git remote set-url origin https://github.com/YOUR_USERNAME/YourProjectName.git

# Or add new origin (if copied folder)
git init
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YourProjectName.git
git branch -M main

# Push to GitHub
git push -u origin main
```

---

## Step 4: Create Supabase Project

### 4.1 Create Project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Name:** Your project name
   - **Database Password:** Generate a strong password (save it!)
   - **Region:** Choose closest to your users
4. Click **"Create new project"**
5. Wait for project to be ready (~2 minutes)

### 4.2 Get Your Keys
1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (e.g., `https://abcdefgh12345.supabase.co`)
   - **anon public** key (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)
3. Note your **Project Reference ID** from the URL:
   - URL: `https://supabase.com/dashboard/project/abcdefgh12345`
   - Reference ID: `abcdefgh12345`

---

## Step 5: Configure Local Environment

### 5.1 Create `.env.local`
Create a file named `.env.local` in your project root:

```env
# Supabase Configuration
# Project: YourProjectName
# Dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_REF/

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

> ⚠️ **Important:** Never commit `.env.local` to git! It should already be in `.gitignore`.

---

## Step 6: Link Supabase CLI & Push Migrations

### 6.1 Login to Supabase CLI
```bash
supabase login
```
This opens a browser to authenticate.

### 6.2 Link to Your Project
```bash
supabase link --project-ref YOUR_PROJECT_REF
```
Replace `YOUR_PROJECT_REF` with your project reference ID (e.g., `abcdefgh12345`).

### 6.3 Push Database Migrations
```bash
supabase db push
```
This creates all tables defined in `supabase/migrations/`.

---

## Step 7: Test Locally

### 7.1 Install Dependencies
```bash
npm install
```

### 7.2 Start Development Server
```bash
npm run dev
```

### 7.3 Verify Connection
1. Open [http://localhost:3000](http://localhost:3000)
2. Check that:
   - ✅ Database shows "Connected"
   - ✅ Environment variables show "Set"
   - ✅ You can insert test records

---

## Step 8: Deploy to Vercel

### 8.1 Connect GitHub to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **"Import Git Repository"**
3. Select your repository (e.g., `YourProjectName`)
4. Click **"Import"**

### 8.2 Configure Environment Variables
Before deploying, add these environment variables in Vercel:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |

### 8.3 Deploy
Click **"Deploy"** and wait for the build to complete.

### 8.4 Verify Production
Visit your Vercel URL and verify everything works.

---

## Step 9: Enable Auto-Deployments

Once connected, Vercel automatically deploys on every push to `main`:

```bash
git add -A
git commit -m "Your changes"
git push
```

Vercel will automatically build and deploy!

---

## Quick Reference: All Keys & Where They Go

| Key | Where to Get | Where to Put |
|-----|--------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API | `.env.local` + Vercel |
| Project Reference ID | Supabase Dashboard URL | `supabase link` command |

---

## File Checklist

| File | Update Required |
|------|-----------------|
| `package.json` | Change `"name"` field |
| `supabase/config.toml` | Change `project_id` |
| `.env.local` | Create with Supabase keys |
| Git remote | Point to new GitHub repo |

---

## Command Summary

```bash
# 1. Update git remote
git remote set-url origin https://github.com/USERNAME/PROJECT.git

# 2. Push to GitHub
git add -A && git commit -m "Initial commit" && git push -u origin main

# 3. Link Supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 4. Push migrations
supabase db push

# 5. Install & run locally
npm install
npm run dev

# 6. Deploy to Vercel (via CLI, optional)
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

---

## Troubleshooting

### "next is not recognized"
Run `npm install` first to install dependencies.

### Database not connecting
- Verify `.env.local` exists and has correct values
- Restart the dev server after creating `.env.local`

### Migrations not applying
- Check you're linked to the correct project: `supabase link --project-ref YOUR_REF`
- Verify migrations exist in `supabase/migrations/`

---

## Created By
This guide documents the setup process for duplicating Vercel + Supabase template projects.

Last updated: December 2024

