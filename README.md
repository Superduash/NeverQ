# NeverQ — Realtime Hospital Queue Platform

> Live hospital wait times on an interactive map, remote queueing without logins, ETA ranges, and leave-by planning.

GitHub Repository: [https://github.com/Superduash/NeverQ](https://github.com/Superduash/NeverQ)

---

## 🎨 Typography & Design Identity

- **Headings**: **Plus Jakarta Sans** (Weights: 600–800) — Friendly, modern, precise, and authoritative.
- **Body, Buttons, Controls, Dashboards**: **Inter** (Weights: 400–700, tabular figures for countdowns/tokens).
- **Themes**:
  - **Lagoon Daylight** (Light theme): Airy aqua-tinted glassmorphic wash with deep-navy typography (`#03045e`/`#023e8a`), brand gradients (`#0077b6` → `#00b4d8`), coral & sun accents (`#ff6b57`/`#ffb703`). Map basemap: OpenFreeMap Liberty.
  - **Midnight Reef** (Dark theme): Deep ocean navy (`#00111c` → `#00253e`) with luminous cyan (`#22d3ee`) and mint (`#5af0c4`) glow. Map basemap: OpenFreeMap Dark.

---

## 📁 Repository Structure

```text
NeverQ/
├── frontend/             # React 18 + Vite + Tailwind CSS v4 + MapLibre + PWA (Deploy on Vercel)
│   ├── public/           # Static assets, PWA icons, manifest, logo.svg
│   ├── src/
│   │   ├── components/   # UI primitives, MapView module, Guided helper assistant
│   │   ├── lib/          # API client, Socket.io manager, Sonner notify, sound alerts
│   │   ├── pages/        # Landing, HospitalView, JoinQueue, LiveTicket, Board, Staff & Admin
│   │   ├── index.css     # Design tokens, theme variables, marker pills, safe areas
│   │   └── main.jsx      # Root router, PWA bootstrap, toast notifications
│   ├── vite.config.js    # Vite + PWA offline caching & icon generation
│   ├── vercel.json       # Vercel SPA rewrites and immutable asset caching
│   └── package.json
│
├── backend/              # Node.js + Express + Socket.IO server (Deploy on Render)
│   ├── src/
│   │   └── server.js     # Express server, Socket.IO rooms, CORS, health probes
│   ├── render.yaml       # Render Blueprint infrastructure-as-code
│   └── package.json
│
├── BackendIntegrationRef.md # Authoritative frontend-to-backend integration contract
└── README.md
```

---

## ⚙️ Environment Variables (Phase D.2)

### Frontend (`frontend/.env` / Vercel Environment Variables)

| Variable | Default (Local / Mock) | Production (Vercel) | Description |
| :--- | :--- | :--- | :--- |
| `VITE_USE_MOCK` | `true` | `false` | When `false`, points to the live backend server. When `true`, uses in-memory mock engine. |
| `VITE_API_URL` | `http://localhost:4000/api` | `https://neverq-backend.onrender.com/api` | Full URL to the backend REST API endpoint. Leave empty if same-origin. |
| `VITE_SOCKET_URL` | `http://localhost:4000` | `https://neverq-backend.onrender.com` | Base URL for realtime Socket.IO websocket connection. |
| `VITE_MAP_STYLE` | `https://tiles.openfreemap.org/styles/liberty` | `https://tiles.openfreemap.org/styles/liberty` | Vector tiles basemap style for Light mode. |
| `VITE_MAP_STYLE_DARK` | `https://tiles.openfreemap.org/styles/dark` | `https://tiles.openfreemap.org/styles/dark` | Vector tiles basemap style for Dark mode. |
| `VITE_ORS_ENABLED` | `false` | `false` | Feature flag to draw route polylines via OpenRouteService or fallback curved route. |

> **Fail-Fast Notice in Dev**: If `VITE_USE_MOCK=false` and `VITE_API_URL` is omitted, the frontend warns in console and surfaces connection status banners.

---

## 🚀 Quick Start (Local Development)

### 1. Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:5173`. By default, it operates in in-memory mock mode (`VITE_USE_MOCK=true`), simulating live queue events, jitter, doctor delays, and instant booking without requiring the backend server.

### 2. Backend

```bash
cd backend
npm install
npm run dev
```

The backend server runs on `http://localhost:4000`. Health check endpoint: `http://localhost:4000/api/health`.

---

## ☁️ Deployment Guide (Phase D)

### Deploying Frontend to Vercel (Phase D.1 & D.6)

1. Import repository `https://github.com/Superduash/NeverQ` into [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Framework Preset: **Vite**.
4. Configure Environment Variables in Vercel:
   - `VITE_USE_MOCK`: `false`
   - `VITE_API_URL`: `https://neverq-backend.onrender.com/api`
   - `VITE_SOCKET_URL`: `https://neverq-backend.onrender.com`
5. `frontend/vercel.json` automatically configures:
   - SPA single-page routing: `/(.*)` → `/index.html`
   - Immutable caching for hashed assets in `/assets/*` (`max-age=31536000, immutable`)
   - Revalidation headers for `sw.js` and `workbox-*.js` (`no-cache, no-store, must-revalidate`)
   - Correct manifest MIME type (`application/manifest+json; charset=utf-8`)

### Deploying Backend to Render (Phase D.4)

1. Create a **Web Service** on [Render](https://render.com) connected to this repository (or use `backend/render.yaml`).
2. Set **Root Directory** to `backend`.
3. Environment: **Node**.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Health Check Path: `/api/health`
7. Set Environment Variables:
   - `NODE_ENV`: `production`
   - `FRONTEND_URL`: `https://your-neverq-app.vercel.app` (for CORS origin allowance)

### Backend CORS Configuration (Phase D.4)

The backend Express & Socket.IO server allows requests from the Vercel frontend origin without requiring cookie credentials:
```javascript
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: false }));
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL || '*' } });
```

### Render Cold-Start & "Waking Server" UI (Phase D.4)

Free Render instances spin down after 15 minutes of inactivity. When the user makes their first request:
* If the request takes longer than **3 seconds**, NeverQ's API client automatically displays a non-blocking toast: *"Waking up the server... Free hosting instances may take 15–30s to start."*
* Once the server responds, the banner is automatically dismissed and live queue data renders immediately.

### Alternative Same-Origin Deployment (Phase D.5)

If deploying as a single combined service where Express serves the Vite production bundle:
1. Build frontend: `cd frontend && npm run build`
2. Serve `frontend/dist` as static assets from Express: `app.use(express.static('../frontend/dist'))`
3. Set `VITE_API_URL=""` (empty string). All requests will automatically use relative paths `/api` and `/socket.io`.

---

## 🔒 Integration Reference

For complete backend API schemas, Socket.IO rooms, request/response models, and business logic contracts, refer to:
👉 **[`BackendIntegrationRef.md`](./BackendIntegrationRef.md)**
