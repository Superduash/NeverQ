# NeverQ — Realtime Hospital Queue Platform

> Live hospital wait times on an interactive map, remote queueing without logins, ETA ranges, and leave-by planning.

GitHub Repository: [https://github.com/Superduash/NeverQ](https://github.com/Superduash/NeverQ)

---

## 🎨 Typography & Design Identity

- **Headings**: **Plus Jakarta Sans** (Weights: 600–700) — Friendly, modern, precise, and authoritative.
- **Body, Buttons, Controls, Dashboards**: **Inter** (Weights: 400–600, tabular figures for countdowns/tokens).
- **Themes**:
  - **Lagoon Daylight** (Light theme): Airy aqua-tinted glassmorphic wash with deep-navy typography (`#03045e`/`#023e8a`), brand gradients (`#0077b6` → `#00b4d8`), coral & sun accents (`#ff6b57`/`#ffb703`).
  - **Midnight Reef** (Dark theme): Deep ocean navy (`#00111c` → `#00253e`) with luminous cyan (`#22d3ee`) and mint (`#5af0c4`) glow.

---

## 📁 Repository Structure

```text
NeverQ/
├── frontend/             # React 18 + Vite + Tailwind CSS v4 + MapLibre + PWA (Deploy on Vercel)
│   ├── public/           # Static assets, PWA icons, logo.svg
│   ├── src/
│   │   ├── lib/          # API facade, stateful mock engine, storage helpers
│   │   ├── pages/        # Customer landing page, hospital details, queue join, live ticket
│   │   ├── index.css     # Design tokens, themes, MapLibre styles
│   │   └── main.jsx      # Theme provider, router, toasts, live data hooks
│   ├── index.html        # Zero-flash theme boot, Plus Jakarta Sans & Inter font loading
│   ├── vite.config.js    # Vite + Tailwind v4 + PWA offline caching
│   ├── vercel.json       # Vercel SPA routing and caching headers
│   └── package.json
│
├── backend/              # Node.js + Express + Socket.IO server (Deploy on Render)
│   ├── src/
│   │   └── server.js     # Express server, health probes, Socket.IO rooms & CORS
│   ├── render.yaml       # Render Blueprint infrastructure-as-code
│   └── package.json
│
└── README.md
```

---

## 🚀 Quick Start (Local Development)

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:5173`. By default, it operates in in-memory mock mode (`VITE_USE_MOCK=true`), simulating live updates and hospital queue jitter without requiring the backend server.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

The backend server will run on `http://localhost:4000`. Health check endpoint: `http://localhost:4000/api/health`.

---

## ☁️ Deployment Guide

### Deploying Frontend to Vercel

1. Import repository `https://github.com/Superduash/NeverQ` into [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Framework Preset: **Vite**.
4. Configure Environment Variables in Vercel:
   - `VITE_API_URL`: Your Render backend URL + `/api` (e.g. `https://neverq-backend.onrender.com/api`)
   - `VITE_SOCKET_URL`: Your Render backend URL (e.g. `https://neverq-backend.onrender.com`)
   - `VITE_USE_MOCK`: `false` (or `true` if demonstrating standalone)

`frontend/vercel.json` automatically configures SPA routing and optimal asset caching.

### Deploying Backend to Render

1. Create a new **Web Service** on [Render](https://render.com) connected to `https://github.com/Superduash/NeverQ` (or use the Blueprint in `backend/render.yaml`).
2. Set **Root Directory** to `backend`.
3. Environment: **Node**.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Health Check Path: `/api/health`
7. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `FRONTEND_URL`: Your Vercel frontend URL (e.g. `https://never-q.vercel.app`)
