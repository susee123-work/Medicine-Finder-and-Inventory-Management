# Deploying MediPulse AI on Render

This guide outlines how to deploy **MediPulse AI** to [Render](https://render.com) using your GitHub repository:
`https://github.com/susee123-work/Medicine-Finder-and-Inventory-Management.git`

---

## Architecture Overview

MediPulse AI supports two deployment topologies on Render:

| Method | Architecture | Render Services Needed | Free Tier Cost | Setup Time |
| :--- | :--- | :--- | :--- | :--- |
| **Option A (Recommended)** | **Unified Full-Stack Web Service** | 1 Web Service (Python) | **100% Free** (1 free instance) | ~2 minutes |
| **Option B** | **Split Backend & Frontend** | 1 Web Service + 1 Static Site | **100% Free** | ~4 minutes |

---

## Option A: Unified Web Service (FastAPI serves Vite React SPA) - Recommended

In this mode, a single Render Web Service builds both the Python backend and React frontend. FastAPI hosts the REST endpoints, live WebSockets (`/ws/live`), and serves the pre-built React application. **Zero CORS issues, single URL.**

### Step 1: Push Repository to GitHub
Ensure all code is committed and pushed:
```bash
git remote set-url origin https://github.com/susee123-work/Medicine-Finder-and-Inventory-Management.git
git push -u origin main
```

### Step 2: Create a Web Service on Render
1. Log into [Render Dashboard](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Select **Build and deploy from a Git repository** and connect your GitHub repo `susee123-work/Medicine-Finder-and-Inventory-Management`.
4. Fill in the following service settings:
   - **Name:** `medipulse-ai` (or your preferred name)
   - **Region:** Any (e.g., `Oregon (US West)` or `Singapore`)
   - **Branch:** `main`
   - **Runtime:** `Python 3`
   - **Build Command:** `./build.sh` (or `pip install -r requirements.txt && cd frontend && npm install && npm run build && cd ..`)
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** `Free`

### Step 3: Configure Environment Variables
Under the **Environment Variables** section in Render, add:
| Key | Recommended Value | Purpose |
| :--- | :--- | :--- |
| `PYTHON_VERSION` | `3.11.9` | Ensures Python 3.11 compatibility |
| `NODE_VERSION` | `20.18.0` | Ensures LTS Node.js for Vite build |
| `ENV` | `production` | Production mode |
| `DEBUG` | `false` | Disables debug stack traces |
| `USE_LOCAL_DB` | `true` | Runs auto-seeded high-performance in-memory DW |
| `JWT_SECRET` | *(Click "Generate" in Render)* | Secret key for auth tokens |
| `SMTP_USERNAME` | `suseendharmadhavan@gmail.com` | Gmail address for 6-digit OTP delivery |
| `SMTP_PASSWORD` | `rodslrylnqguxznd` | Google App Password (16 chars, no spaces) |
| `SMTP_HOST` | `smtp.gmail.com` | Google SMTP host |
| `SMTP_PORT` | `587` | STARTTLS port |
| `ALLOWED_ORIGINS` | `*` | Allows cross-origin API and WebSocket traffic |

### Step 4: Click "Create Web Service"
Render will automatically:
1. Run `./build.sh` (installs Python dependencies + runs `npm run build` in `frontend/`).
2. Start the FastAPI server with live WebSockets and SPA routing on your assigned `https://medipulse-ai.onrender.com` domain.

---

## Option B: Split Deployment (Backend Web Service + Frontend Static Site)

If you prefer hosting the React frontend on Render's dedicated CDN Static Site network:

### 1. Deploy the Backend Web Service
- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Assigned URL:** e.g., `https://medipulse-api.onrender.com`

### 2. Deploy the Frontend Static Site
1. Click **New +** -> **Static Site**.
2. Connect the same repository.
3. Configure:
   - **Root Directory:** `frontend`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
4. Add Environment Variables:
   - `VITE_API_BASE_URL`: `https://medipulse-api.onrender.com`
   - `VITE_WS_BASE_URL`: `wss://medipulse-api.onrender.com`
5. Click **Create Static Site**.
6. In **Redirects / Rewrites**, add a rewrite:
   - **Source:** `/*`
   - **Destination:** `/index.html`
   - **Action:** `Rewrite`

---

## Option C: Render Blueprint (1-Click Deployment via `render.yaml`)

This repository includes a `render.yaml` configuration file.
1. In the Render Dashboard, click **New +** -> **Blueprint**.
2. Connect `https://github.com/susee123-work/Medicine-Finder-and-Inventory-Management.git`.
3. Render will auto-discover `render.yaml`, prefill all settings, and prompt you only for `SMTP_USERNAME` and `SMTP_PASSWORD`.
4. Click **Apply**.
