# BackendIntegrationRef.md

Authoritative integration specification derived strictly from the implemented frontend codebase (`src/lib/api.js`, `src/lib/mock/engine.js`, `src/lib/socket.js`, and consuming views).

---

## 1. Environment Variables & Hosting Configuration

### 1.1 Frontend Environment (`frontend/.env` / Vercel Environment Settings)

```ini
VITE_USE_MOCK=false
VITE_API_URL=https://neverq-backend.onrender.com/api
VITE_SOCKET_URL=https://neverq-backend.onrender.com
VITE_MAP_STYLE=https://tiles.openfreemap.org/styles/liberty
VITE_MAP_STYLE_DARK=https://tiles.openfreemap.org/styles/dark
VITE_ORS_ENABLED=false
```

- When `VITE_USE_MOCK=false`, frontend routes all HTTP calls via `fetch` to `${VITE_API_URL}${endpoint}` and all websocket events through `io(VITE_SOCKET_URL)`.
- If `VITE_API_URL` is empty, frontend defaults to relative paths `/api` (for same-origin deployments where Express serves the Vite build).

### 1.2 Expected Backend Environment (`backend/.env` / Render Settings)

```ini
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://your-neverq-app.vercel.app
JWT_SECRET=your_jwt_secret_key
DATABASE_URL=postgres://...
```

### 1.3 CORS & Cold-Start Expectations

- **CORS Allowed Origin**: Must allow `process.env.FRONTEND_URL` and `localhost:5173`. Credentials (cookies) are not required since Bearer tokens are passed in headers.
- **Socket.IO CORS**: Must accept incoming websocket/polling connections from `FRONTEND_URL`.
- **Cold-Start Latency**: Frontend incorporates a 3,000 ms timer. If initial request exceeds 3 s on Render free tier, a non-blocking toast informs the user: *"Waking up the server... Free hosting instances may take 15–30s to start."*

---

## 2. Authentication Contract

### 2.1 Staff Authentication

- **Login Request**: `POST /api/staff/login`
  - Body: `{ "orgId": string, "pin": string }`
- **Success Response**: `{ "token": string, "staff": { "orgId": string, "name": string, "role": "staff" } }`
- **Storage Key**: `localStorage.getItem('nq-staff-token')` and `localStorage.getItem('nq-staff-org')`.
- **Header Injection**: All staff calls send `Authorization: Bearer <token>`.
- **Socket Auth**: Handshake includes `auth: { token: <token> }`.

### 2.2 Admin Authentication

- **Login Request**: `POST /api/admin/login`
  - Body: `{ "password": string }`
- **Success Response**: `{ "token": string, "admin": { "role": "admin" } }`
- **Storage Key**: `localStorage.getItem('nq-admin-token')`.
- **Header Injection**: All admin calls send `Authorization: Bearer <token>`.

### 2.3 401 Unauthorized Handling

- When any request receives HTTP `401`:
  - If role was admin: `localStorage.removeItem('nq-admin-token')` and redirect to `/admin/login`.
  - If role was staff: `localStorage.removeItem('nq-staff-token')` and redirect to `/staff/login`.
  - A toast notifies: *"Session expired. Please log in again."*

---

## 3. Implemented REST Endpoints

### 3.1 Public Customer Endpoints

#### `GET /api/orgs`
- **Query Params**: `lat` (float, opt), `lng` (float, opt), `dept` (string, opt).
- **Screens**: `Landing.jsx`, `Assistant.jsx`.
- **Consumes**: Array of Org objects:
  ```json
  [
    {
      "id": "harbour",
      "name": "Harbour Care Clinic",
      "lat": 13.0450,
      "lng": 80.2450,
      "area": "Mylapore",
      "address": "42 Marina Beach Rd, Mylapore, Chennai",
      "hours": "8:00 AM – 8:00 PM",
      "open": true,
      "demo": true,
      "departments": [
        {
          "id": "gen",
          "name": "General OPD",
          "countersOpen": 2,
          "countersTotal": 3,
          "eta": { "low": 10, "mid": 14, "high": 20 },
          "confidence": "High (active queue)"
        }
      ]
    }
  ]
  ```
- **Error Codes**: `NETWORK_ERROR`, `DEFAULT`.

#### `GET /api/orgs/:id`
- **Screens**: `HospitalView.jsx`, `JoinQueue.jsx`.
- **Consumes**: Single Org object matching above structure, plus optional `rules: { remoteEnabled: boolean, cap: number }`.
- **Error Codes**: `NOT_FOUND` (404), `NETWORK_ERROR`.

#### `GET /api/orgs/:id/board`
- **Query Params**: `deptId` (string, opt).
- **Screens**: `Board.jsx`.
- **Consumes**:
  ```json
  {
    "org": { "id": "harbour", "name": "Harbour Care Clinic" },
    "serving": [
      { "token": "A104", "counterName": "Desk 1", "deptName": "General OPD" }
    ],
    "next": [
      { "token": "A105", "deptName": "General OPD" }
    ],
    "lastUpdated": 1728840000000
  }
  ```

#### `POST /api/tickets`
- **Screens**: `JoinQueue.jsx`.
- **Payload**:
  ```json
  {
    "orgId": "harbour",
    "deptId": "gen",
    "name": "Patient Name",
    "phone": "+91 98765 43210",
    "beneficiary": "myself",
    "deviceId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Consumes**: Ticket object with `{ "token": string, "id": string, "status": "waiting", "label": "A104", "queuePosition": 4, "lastEta": { "low": 12, "mid": 16, "high": 22 } }`.
- **Error Codes**: `DUPLICATE_TICKET` (409), `COOLDOWN` (403), `REMOTE_CAP` (429), `HOSPITAL_CLOSED` (400), `REMOTE_DISABLED` (400).

#### `GET /api/tickets/:token`
- **Screens**: `LiveTicket.jsx`, `Landing.jsx` (resume chip).
- **Consumes**:
  ```json
  {
    "token": "A104",
    "id": "t-104",
    "status": "waiting | called | serving | done | skipped | cancelled | expired | removed",
    "label": "A104",
    "name": "Patient Name",
    "phone": "+91 98765 43210",
    "queuePosition": 3,
    "lastEta": { "low": 10, "mid": 14, "high": 18 },
    "calledToCounter": "Desk 2",
    "calledAt": 1728840100000,
    "arrived": false,
    "arrivedAt": null,
    "changes": [
      { "text": "Wait extended: Counter 2 paused", "timestamp": 1728840050000 }
    ],
    "org": { "id": "harbour", "name": "Harbour Care Clinic", "lat": 13.045, "lng": 80.245 },
    "dept": { "id": "gen", "name": "General OPD" }
  }
  ```
- **Error Codes**: `NOT_FOUND` (404), `NETWORK_ERROR`.

#### `POST /api/tickets/:token/arrive`
- **Screens**: `LiveTicket.jsx` ("I'm Here" button).
- **Payload**: `{ "lat": 13.0452, "lng": 80.2451 }`.
- **Consumes**: `{ "success": true, "arrivedAt": number }`.
- **Error Codes**: `OUT_OF_RANGE` (400, > 350 meters away), `NOT_FOUND` (404).

#### `POST /api/tickets/:token/cancel`
- **Screens**: `LiveTicket.jsx`.
- **Consumes**: `{ "success": true, "cancelledAt": number }`.
- **Error Codes**: `NOT_FOUND` (404).

#### `POST /api/travel`
- **Screens**: `useLiveData`, `MapView`, `HospitalView`, `LiveTicket`.
- **Payload**: `{ "from": { "lat": number, "lng": number }, "to": { "lat": number, "lng": number }, "mode": "walk|bike|car" }`.
- **Consumes**: `{ "minutes": number, "km": number, "source": "route|estimate", "label": "approx." }`.

---

### 3.2 Staff Console Endpoints (Protected by Bearer Token)

#### `GET /api/staff/queue`
- **Query Params**: `orgId`, `deptId`.
- **Screens**: `StaffDashboard.jsx`.
- **Consumes**:
  ```json
  {
    "counters": [
      { "id": "c1", "name": "Desk 1", "state": "open | paused | closed", "servingTicket": null }
    ],
    "activeTicket": null,
    "queue": [
      {
        "id": "t-1",
        "token": "A104",
        "name": "Patient",
        "phone": "+91 98765 43210",
        "arrived": true,
        "priority": "regular | urgent | priority",
        "joinedAt": 1728839000000,
        "sim": false
      }
    ],
    "skipped": [],
    "recentCompleted": []
  }
  ```

#### `POST /api/staff/call-next`
- **Payload**: `{ "orgId": string, "deptId": string, "counterId": string }`.
- **Consumes**: `{ "ticket": Ticket, "counter": Counter }`.
- **Error Codes**: `COUNTER_NOT_OPEN` (400), `NO_ARRIVED_TICKETS` (404), `ALREADY_CALLED` (409).

#### `POST /api/staff/start-consultation`
- **Payload**: `{ "ticketId": string, "counterId": string }`.
- **Consumes**: `{ "ticket": Ticket }`.

#### `POST /api/staff/complete-consultation`
- **Payload**: `{ "ticketId": string, "counterId": string }`.
- **Consumes**: `{ "ticket": Ticket, "completedAt": number }`.

#### `POST /api/staff/skip`
- **Payload**: `{ "ticketId": string, "counterId": string }`.
- **Consumes**: `{ "ticket": Ticket, "requeuedPosition": number }`.

#### `POST /api/staff/requeue`
- **Payload**: `{ "ticketId": string, "position": number }`.
- **Consumes**: `{ "ticket": Ticket }`.

#### `POST /api/staff/remove`
- **Payload**: `{ "ticketId": string, "reason": string }`.
- **Consumes**: `{ "success": true }`.

#### `POST /api/staff/set-delay`
- **Payload**: `{ "orgId": string, "deptId": string, "minutes": number }`.
- **Consumes**: `{ "delayMinutes": number }`.

#### `POST /api/staff/counters`
- **Payload**: `{ "counterId": string, "state": "open | paused | closed" }`.
- **Consumes**: `{ "counter": Counter }`.

#### `POST /api/staff/urgent`
- **Payload**: `{ "orgId": string, "deptId": string, "reason": string, "patientName": string }`.
- **Consumes**: `{ "ticket": Ticket }`.

#### `POST /api/staff/walkin`
- **Payload**: `{ "orgId": string, "deptId": string, "name": string, "phone": string }`.
- **Consumes**: `{ "ticket": Ticket }`.

---

### 3.3 Admin & Demo Director Endpoints (Protected by Bearer Token)

#### `GET /api/admin/summary`
- **Screens**: `AdminDashboard.jsx`.
- **Consumes**:
  ```json
  {
    "totalOrgs": 4,
    "activeQueues": 8,
    "waitingPatients": 24,
    "servedToday": 142,
    "avgWaitMin": 14.5,
    "rushFactor": 1.0,
    "offsetMinutes": 0
  }
  ```

#### `POST /api/admin/orgs`
- **Payload**: `{ "name": string, "lat": number, "lng": number, "area": string, "address": string, "staffPin": string }`.
- **Consumes**: `{ "id": string, "org": Org }`.

#### `PUT /api/admin/orgs/:id`
- **Payload**: `{ "name": string, "lat": number, "lng": number, "area": string, "address": string, "staffPin": string }`.
- **Consumes**: `{ "org": Org }`.

#### `POST /api/admin/orgs/:id/toggle`
- **Consumes**: `{ "id": string, "open": boolean }`.

#### `POST /api/demo/reset`
- **Consumes**: `{ "success": true, "resetAt": number }`.

#### `POST /api/demo/simulate`
- **Payload**: `{ "orgId": string, "deptId": string, "count": number }`.
- **Consumes**: `{ "simulated": number }`.

#### `POST /api/demo/fast-forward`
- **Payload**: `{ "minutes": number }`.
- **Consumes**: `{ "offsetMinutes": number }`.

#### `POST /api/demo/rush-hour`
- **Payload**: `{ "factor": number }` (e.g. 1.0, 1.3, 1.6).
- **Consumes**: `{ "rushFactor": number }`.

---

## 4. Realtime Architecture (Socket.IO)

### 4.1 Room Subscriptions

| Screen | Room Name | Events Listened | Trigger |
| :--- | :--- | :--- | :--- |
| `Landing.jsx` | `orgs` | `queue:update` | Any queue count, ETA change, or hospital status change. |
| `HospitalView.jsx` | `org:<orgId>` | `queue:update` | Queue change within specific facility. |
| `LiveTicket.jsx` | `ticket:<token>` | `ticket:update` | Ticket called, position moved, arrival verified, ETA recalculated. |
| `Board.jsx` | `org:<orgId>` | `board:update` | Counter calls, now serving changes, next in line changes. |
| `StaffDashboard.jsx` | `staff:<orgId>:<deptId>` | `queue:update`, `counter:update`, `staff:event` | Realtime ticket queue modifications, patient check-in. |
| `AdminDashboard.jsx` | `admin` | `stats:update` | Aggregated traffic and simulation changes. |

### 4.2 Room Management Protocol
- **Join**: Client emits `room:join` with room string.
- **Leave**: Client emits `room:leave` with room string.
- **Reconnection**: Client automatically re-emits `room:join` for all active rooms upon reconnect.

### 4.3 Polling Safety Net
- Every `useLiveData` subscriber maintains an autonomous **10,000 ms interval poll**.
- If Socket.IO drops or enters polling fallback, fresh data fetches every 10 s.
- **Visibility Refetch**: When user refocuses tab (`document.visibilityState === 'visible'`), immediate background refetch executes.

---

## 5. Primary Data Shapes Consumed

### 5.1 Org Shape
```typescript
interface Org {
  id: string; // required
  name: string; // required
  lat: number; // required
  lng: number; // required
  area: string; // required
  address?: string; // optional
  hours?: string; // optional
  open?: boolean; // default true
  demo?: boolean; // optional badge
  departments: Department[]; // required
  rules?: {
    remoteEnabled?: boolean;
    cap?: number;
  };
}
```

### 5.2 Department Shape
```typescript
interface Department {
  id: string; // required
  name: string; // required (e.g. "General OPD", "Eye Clinic", "Cardiology")
  countersOpen: number; // required
  countersTotal: number; // required
  eta: {
    low: number; // required, minutes
    mid: number; // required, minutes
    high: number; // required, minutes
  };
  confidence: string; // e.g. "High (active queue)", "Calculated live"
}
```

### 5.3 Ticket Shape
```typescript
interface Ticket {
  id: string; // internal id
  token: string; // required customer identifier (e.g. "A104")
  status: 'waiting' | 'called' | 'serving' | 'done' | 'skipped' | 'cancelled' | 'expired' | 'removed';
  label: string; // display token string
  name: string; // customer name
  phone: string; // international phone format
  queuePosition: number; // 1-indexed position
  lastEta: { low: number; mid: number; high: number };
  calledToCounter?: string; // e.g. "Desk 1"
  calledAt?: number; // epoch ms
  arrived: boolean; // check-in status
  arrivedAt?: number; // epoch ms
  changes?: Array<{ text: string; timestamp: number }>; // wait adjustment reasons
  org?: { id: string; name: string; lat: number; lng: number };
  dept?: { id: string; name: string };
  simulated?: boolean;
}
```

---

## 6. Business Rules Enforced by Backend

1. **Arrival Geofencing**: Check-in (`/arrive`) succeeds only if distance between coordinates and hospital coordinate is $\le 350\text{ meters}$.
2. **Abuse Cooldown**: If a device ID incurs 2 consecutive no-shows, remote booking transitions to `COOLDOWN` (403) for 24 hours. Walk-in bookings remain accepted.
3. **Queue Position Ordering**:
   - Urgent tickets inserted at position 1.
   - Arrived patients sorted ahead of non-arrived patients when staff calls `call-next`.
   - Skipped tickets requeued after 2 subsequent turns.
4. **Counter Mutex**: Calling next ticket must be atomic across counters; ticket cannot be called by two counters concurrently.
5. **Session Expiry (TTL)**: Called tickets not marked "serving" within 10 minutes transition to `expired` or `skipped`.

---

## 7. Client Persistence Contract (`localStorage` / `sessionStorage`)

| Key | Storage | Type | Lifetime | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `nq_device_id` | `localStorage` | UUID string | Permanent | Device fingerprint for rate-limiting & abuse prevention. |
| `nq-active-ticket` | `localStorage` | JSON `{ token, status, label }` | Until session end | Header quick-chip and resume card. |
| `nq-cached-ticket-<token>` | `localStorage` | JSON `{ ticket, cachedAt }` | 48 hours | Offline ticket state rendering when disconnected. |
| `nq-saved-orgs` | `localStorage` | Array `<orgId>` | Permanent | Bookmarked hospitals (star icon). |
| `nq-recent-orgs` | `localStorage` | Array `<orgId>` | Permanent | Recently viewed hospital history. |
| `nq-staff-token` | `localStorage` | JWT string | Until logout / 401 | Staff session bearer token. |
| `nq-admin-token` | `localStorage` | JWT string | Until logout / 401 | Admin session bearer token. |
| `nq-last-location-preset` | `localStorage` | string ID | Permanent | Remembered origin location preset. |
| `nq-sidebar-collapsed` | `localStorage` | boolean string | Permanent | Desktop responsive sidebar layout preference. |
| `nq-assistant-dismissed` | `localStorage` | boolean string | Permanent | Hide assistant launcher button state. |
| `nq-dismiss-emergency` | `sessionStorage`| boolean string | Tab session | Dismissed banner for medical emergency disclaimer. |
| `nq-alerts-unlocked` | `sessionStorage`| boolean string | Tab session | AudioContext & vibration unlocked by user gesture. |

---

## 8. Mock-Only Behaviour that the Backend Must Replace

1. **Jitter & Queue Drift**: `mockEngine` uses `setInterval` adding randomized drift ($\pm 1\text{m}$) and simulating doctor consultation completions. Backend must calculate real ETAs based on active desk throughput:
   $$\text{ETA}_{\text{mid}} = \frac{\text{Position} \times \text{AvgDuration}}{\text{OpenCounters}}$$
2. **Deterministic Seed Data**: Mock regenerates 4 fixed hospitals (`harbour`, `central`, `apollo`, `fortis`). Backend must persist hospital records and counter definitions in PostgreSQL.
3. **Demo Fast-Forward / Rush Hour**: In mock, `rushFactor` scales travel time artificially. Backend must interface with live traffic API or OpenRouteService when `VITE_ORS_ENABLED=true`.

---

## 9. Differences Between Mock and Spec (§9)

1. **Phone Verification**: Mock does not send SMS OTPs; phone input accepts valid format and immediately creates ticket.
2. **Token Format**: Mock generates tokens like `A104`, `C201` prefixing department initial. Backend token generator must guarantee uniqueness per day per facility.
3. **Screen Wake Lock**: Handled purely client-side via Screen Wake Lock API when `ticket.status === 'called'`. Backend does not need to send wake commands.

---

## 10. Known Integration Risks & Gaps

1. **Render Free Tier Spin-Down**: Render spins down inactive backend containers. Cold-start requests take 15–30s. The frontend handles this with the waking server banner, but health check pings or keep-alive cron jobs are recommended for production demos.
2. **Websocket Reconnection Thundering Herd**: When backend restarts, all connected clients reconnect simultaneously. The frontend uses `reconnectionDelay: 1000` and `reconnectionDelayMax: 5000` with jitter to avoid thundering herds.
3. **Clock Skew**: The client uses local timestamp comparison for relative countdowns. The backend must provide standard epoch timestamps (UTC milliseconds) in all payload date fields (`calledAt`, `arrivedAt`, `joinedAt`, `lastUpdated`).
