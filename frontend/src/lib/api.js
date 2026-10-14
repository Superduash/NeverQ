// NeverQ API Client (NeverQ2 §9)
// Switchable between Stateful Mock Engine and Real REST API via VITE_USE_MOCK

import { mockEngine } from './mock/engine.js';
import { notify } from './notify.js';
import { getErrorMessage } from './messages.js';
import { clock } from './clock.js';
import { estimateTravel } from './travelModel.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
// F-23: empty VITE_API_URL → '/api'; undefined in dev → 'http://localhost:4000/api'
const envApiUrl = import.meta.env.VITE_API_URL;
const BASE_URL = envApiUrl === '' ? '/api' : (envApiUrl || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api'));

// Helper for Real API HTTP Requests
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Attach auth tokens by path prefix (not blanket attach)
  if (endpoint.startsWith('/admin')) {
    const adminToken = localStorage.getItem('nq-admin-token');
    if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
  } else if (endpoint.startsWith('/staff')) {
    const staffToken = localStorage.getItem('nq-staff-token');
    if (staffToken) headers['Authorization'] = `Bearer ${staffToken}`;
  }

  // Phase D.4: Render cold-start detection (>3s triggers waking server notice)
  let wakeTimer = null;
  if (!USE_MOCK) {
    wakeTimer = setTimeout(() => {
      notify.info('Waking up the server... Free hosting instances may take 15–30s to start.', {
        id: 'nq-waking-server',
        duration: 20000,
      });
    }, 3000);
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (wakeTimer) clearTimeout(wakeTimer);
    notify.dismiss('nq-waking-server');

    // Sync server demo clock if header is present
    const serverNow = res.headers.get('X-NQ-Server-Now');
    if (serverNow) {
      clock.sync(Number(serverNow));
    }

    if (res.status === 401) {
      const isLoginCall = endpoint === '/staff/login' || endpoint === '/admin/login';
      if (!isLoginCall) {
        if (endpoint.startsWith('/admin')) {
          localStorage.removeItem('nq-admin-token');
          window.location.href = '/admin/login';
        } else if (endpoint.startsWith('/staff')) {
          localStorage.removeItem('nq-staff-token');
          window.location.href = '/staff/login';
        }
        notify.error('Session expired. Please log in again.');
      }
      const errBody = await res.json().catch(() => ({}));
      throw {
        ...errBody,
        status: 401,
        code: errBody.code || 'AUTH_REQUIRED',
        message: errBody.message || 'Authentication required',
      };
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      // F-11: preserve the FULL body so callers can read err.token, err.retryAfterMs, etc.
      throw {
        ...data,
        status: res.status,
        code: data.code || 'REQUEST_FAILED',
        message: data.message || getErrorMessage(data.code),
      };
    }

    return data;
  } catch (err) {
    if (wakeTimer) clearTimeout(wakeTimer);
    notify.dismiss('nq-waking-server');
    if (err.status) throw err;
    throw {
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Network error. Please check your connection.',
    };
  }
}

// ───────────── API Client Facade ─────────────
export const api = {
  // ── Public Endpoints ──

  // GET /api/orgs?lat&lng&dept
  listOrgs: async (params = {}) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.listOrgs(params);
    }
    const query = new URLSearchParams(params).toString();
    return request(`/orgs${query ? `?${query}` : ''}`);
  },

  // GET /api/orgs/:id
  getOrg: async (id) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.getOrg(id);
    }
    return request(`/orgs/${id}`);
  },

  // GET /api/orgs/:id/board?deptId (Phase 10.1 Public Wait Board)
  getBoard: async (orgId, deptId = null) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.getBoard(orgId, deptId);
    }
    const query = deptId ? `?deptId=${encodeURIComponent(deptId)}` : '';
    return request(`/orgs/${orgId}/board${query}`);
  },

  // POST /api/tickets
  createTicket: async (payload) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 200));
      return mockEngine.createTicket(payload);
    }
    return request('/tickets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // GET /api/tickets/:token
  getTicket: async (token) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.getTicket(token);
    }
    return request(`/tickets/${token}`);
  },

  // POST /api/tickets/:token/arrive
  arriveTicket: async (token, coords) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.arriveTicket(token, coords);
    }
    return request(`/tickets/${token}/arrive`, {
      method: 'POST',
      body: JSON.stringify(coords),
    });
  },

  // POST /api/tickets/:token/cancel
  cancelTicket: async (token) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.cancelTicket(token);
    }
    return request(`/tickets/${token}/cancel`, {
      method: 'POST',
    });
  },

  // POST /api/travel {from, to, mode} (Phase A.4 with 3s timeout)
  travel: async ({ from, to, mode = 'car' }) => {
    const rush = USE_MOCK ? (mockEngine.db?.settings?.rushFactor || 1) : 1;

    const fetchWithTimeout = async () => {
      if (USE_MOCK) {
        await new Promise((r) => setTimeout(r, 60));
        return estimateTravel(from, to, mode, rush);
      }

      return request('/travel', {
        method: 'POST',
        body: JSON.stringify({ from, to, mode }),
      });
    };

    // 3-second timeout race
    try {
      const result = await Promise.race([
        fetchWithTimeout(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Travel timeout')), 3000)),
      ]);
      return result;
    } catch {
      // Fallback: local estimateTravel (never constant 15 min / 3.5 km)
      return estimateTravel(from, to, mode, rush);
    }
  },

  getTravel: async (params) => api.travel(params),

  // ── Staff Endpoints ──

  // POST /api/staff/login
  staffLogin: async ({ orgId, pin }) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 180));
      const res = mockEngine.staffLogin({ orgId, pin });
      localStorage.setItem('nq-staff-token', res.token);
      localStorage.setItem('nq-staff-org', orgId);
      return res;
    }
    const res = await request('/staff/login', {
      method: 'POST',
      body: JSON.stringify({ orgId, pin }),
    });
    if (res.token) {
      localStorage.setItem('nq-staff-token', res.token);
      localStorage.setItem('nq-staff-org', orgId);
    }
    return res;
  },

  // GET /api/staff/queue?deptId
  getStaffQueue: async (deptId) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.getStaffQueue(orgId, deptId);
    }
    return request(`/staff/queue?deptId=${deptId || ''}`);
  },

  // POST /api/staff/counters/:id/call-next (atomic)
  callNext: async (counterId) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.callNext(orgId, counterId);
    }
    return request(`/staff/counters/${counterId}/call-next`, {
      method: 'POST',
    });
  },

  // POST /api/staff/tickets/:id/start
  startTicket: async (ticketId) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.startTicket(ticketId);
    }
    return request(`/staff/tickets/${ticketId}/start`, {
      method: 'POST',
    });
  },

  // POST /api/staff/tickets/:id/done
  doneTicket: async (ticketId) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.doneTicket(ticketId);
    }
    return request(`/staff/tickets/${ticketId}/done`, {
      method: 'POST',
    });
  },

  // POST /api/staff/tickets/:id/skip
  skipTicket: async (ticketId) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      // Re-queue ticket at back
      const ticket = mockEngine.db.tickets.find((t) => t.id === ticketId);
      if (ticket) {
        ticket.status = 'waiting';
        ticket.lateCount = (ticket.lateCount || 0) + 1;
        ticket.sortKey = mockEngine.now();
        mockEngine.save();
      }
      return ticket;
    }
    return request(`/staff/tickets/${ticketId}/skip`, {
      method: 'POST',
    });
  },

  // POST /api/staff/tickets/:id/arrive
  confirmArrival: async (ticketId) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.confirmArrival(ticketId);
    }
    return request(`/staff/tickets/${ticketId}/arrive`, {
      method: 'POST',
    });
  },

  // POST /api/staff/tickets/:id/remove-claim
  removeClaim: async (ticketId) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.removeClaim(ticketId);
    }
    return request(`/staff/tickets/${ticketId}/remove-claim`, {
      method: 'POST',
    });
  },

  // POST /api/staff/tickets/:id/remove
  removeTicket: async (ticketId, { blockPhone = false } = {}) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.removeTicket(ticketId, { blockPhone });
    }
    return request(`/staff/tickets/${ticketId}/remove`, {
      method: 'POST',
      body: JSON.stringify({ blockPhone }),
    });
  },

  // POST /api/staff/walkin
  addWalkin: async ({ deptId, name, priority }) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.addWalkin({ orgId, deptId, name, priority });
    }
    return request('/staff/walkin', {
      method: 'POST',
      body: JSON.stringify({ deptId, name, priority }),
    });
  },

  // POST /api/staff/urgent
  // F-13: opts allows {role:'admin'} so admin dashboard doesn't trigger staff-login redirect
  insertUrgent: async ({ deptId, name, reason }, opts = {}) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.insertUrgent({ orgId, deptId, name, reason });
    }
    return request('/staff/urgent', {
      method: 'POST',
      body: JSON.stringify({ deptId, name, reason }),
      ...opts,
    });
  },

  // POST /api/staff/counters/:id/delay
  // F-13: opts allows {role:'admin'}
  setCounterDelay: async (counterId, { minutes, reason }, opts = {}) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.setCounterDelay(orgId, counterId, { minutes, reason });
    }
    return request(`/staff/counters/${counterId}/delay`, {
      method: 'POST',
      body: JSON.stringify({ minutes, reason }),
      ...opts,
    });
  },

  // POST /api/staff/counters/:id/state
  // F-13: opts allows {role:'admin'}
  setCounterState: async (counterId, { state }, opts = {}) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.setCounterState(orgId, counterId, { state });
    }
    return request(`/staff/counters/${counterId}/state`, {
      method: 'POST',
      body: JSON.stringify({ state }),
      ...opts,
    });
  },

  // ── Admin Endpoints ──

  // POST /api/admin/login
  adminLogin: async ({ password }) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      const res = mockEngine.adminLogin({ password });
      localStorage.setItem('nq-admin-token', res.token);
      return res;
    }
    const res = await request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.token) {
      localStorage.setItem('nq-admin-token', res.token);
    }
    return res;
  },

  // GET /api/admin/summary
  getAdminSummary: async () => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.getAdminSummary();
    }
    return request('/admin/summary', { role: 'admin' });
  },

  // Demo actions
  demoReset: async () => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.demoReset();
    }
    return request('/admin/demo/reset', { method: 'POST', role: 'admin' });
  },

  demoFastForward: async ({ minutes }) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.demoFastForward({ minutes });
    }
    return request('/admin/demo/fast-forward', {
      method: 'POST',
      body: JSON.stringify({ minutes }),
      role: 'admin',
    });
  },

  demoRushHour: async ({ factor }) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.demoRushHour({ factor });
    }
    return request('/admin/demo/rush-hour', {
      method: 'POST',
      body: JSON.stringify({ factor }),
      role: 'admin',
    });
  },

  simulatePatients: async ({ orgId, deptId, count }) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.simulatePatients({ orgId, deptId, count });
    }
    return request('/admin/demo/simulate', {
      method: 'POST',
      body: JSON.stringify({ orgId, deptId, count }),
      role: 'admin',
    });
  },

  createOrg: async (payload) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.createOrg(payload);
    }
    return request('/admin/orgs', {
      method: 'POST',
      body: JSON.stringify(payload),
      role: 'admin',
    });
  },

  updateOrg: async (id, payload) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.updateOrg(id, payload);
    }
    return request(`/admin/orgs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      role: 'admin',
    });
  },

  toggleOrgStatus: async (id) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.toggleOrgStatus(id);
    }
    return request(`/admin/orgs/${id}/toggle-open`, {
      method: 'POST',
      role: 'admin',
    });
  },

  deleteOrg: async (id) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.deleteOrg(id);
    }
    return request(`/admin/orgs/${id}`, {
      method: 'DELETE',
      role: 'admin',
    });
  },

  // GET /api/staff/insights?deptId=
  getStaffInsights: async (deptId) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 80));
      return mockEngine.getStaffInsights(deptId);
    }
    return request(`/staff/insights?deptId=${deptId || ''}`);
  },

  // GET /api/staff/tickets/:id/phone
  revealPhone: async (ticketId) => {
    if (USE_MOCK) {
      return mockEngine.revealPhone(ticketId);
    }
    return request(`/staff/tickets/${ticketId}/phone`);
  },

  // POST /api/admin/demo/scenario
  demoScenario: async ({ type, orgId, deptId }) => {
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 80));
      return mockEngine.demoScenario({ type, orgId, deptId });
    }
    return request('/admin/demo/scenario', {
      method: 'POST',
      body: JSON.stringify({ type, orgId, deptId }),
      role: 'admin',
    });
  },

  // POST /api/admin/demo/clock
  demoSetClock: async ({ offsetMinutes }) => {
    if (USE_MOCK) {
      return mockEngine.demoSetClock({ offsetMinutes });
    }
    return request('/admin/demo/clock', {
      method: 'POST',
      body: JSON.stringify({ offsetMinutes }),
      role: 'admin',
    });
  },

  // GET /api/meta
  getMeta: async () => {
    if (USE_MOCK) {
      return mockEngine.getMeta();
    }
    return request('/meta');
  },
};
