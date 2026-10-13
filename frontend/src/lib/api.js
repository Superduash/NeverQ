// NeverQ API Client (NeverQ2 §9)
// Switchable between Stateful Mock Engine and Real REST API via VITE_USE_MOCK

import { mockEngine } from './mock/engine.js';
import { notify } from './notify.js';
import { getErrorMessage } from './messages.js';

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Helper for Real API HTTP Requests
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Attach auth tokens if available
  const staffToken = localStorage.getItem('nq-staff-token');
  const adminToken = localStorage.getItem('nq-admin-token');
  if (options.role === 'admin' && adminToken) {
    headers['Authorization'] = `Bearer ${adminToken}`;
  } else if (staffToken) {
    headers['Authorization'] = `Bearer ${staffToken}`;
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      // 401 Unauthorized handler
      if (options.role === 'admin') {
        localStorage.removeItem('nq-admin-token');
        window.location.href = '/admin/login';
      } else {
        localStorage.removeItem('nq-staff-token');
        window.location.href = '/staff/login';
      }
      notify.error('Session expired. Please log in again.');
      throw { status: 401, code: 'AUTH_REQUIRED', message: 'Session expired' };
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw {
        status: res.status,
        code: data.code || 'REQUEST_FAILED',
        message: data.message || getErrorMessage(data.code),
      };
    }

    return data;
  } catch (err) {
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

  // POST /api/travel {from, to, mode}
  getTravel: async ({ from, to, mode }) => {
    if (USE_MOCK) {
      const rush = mockEngine.db?.settings?.rushFactor || 1;
      const baseMin = 12;
      return {
        minutes: Math.round(baseMin * rush),
        km: 3.8,
        source: 'estimate',
      };
    }
    return request('/travel', {
      method: 'POST',
      body: JSON.stringify({ from, to, mode }),
    });
  },

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
  insertUrgent: async ({ deptId, name, reason }) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 150));
      return mockEngine.insertUrgent({ orgId, deptId, name, reason });
    }
    return request('/staff/urgent', {
      method: 'POST',
      body: JSON.stringify({ deptId, name, reason }),
    });
  },

  // POST /api/staff/counters/:id/delay
  setCounterDelay: async (counterId, { minutes, reason }) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 120));
      return mockEngine.setCounterDelay(orgId, counterId, { minutes, reason });
    }
    return request(`/staff/counters/${counterId}/delay`, {
      method: 'POST',
      body: JSON.stringify({ minutes, reason }),
    });
  },

  // POST /api/staff/counters/:id/state
  setCounterState: async (counterId, { state }) => {
    const orgId = localStorage.getItem('nq-staff-org') || 'harbour';
    if (USE_MOCK) {
      await new Promise((r) => setTimeout(r, 100));
      return mockEngine.setCounterState(orgId, counterId, { state });
    }
    return request(`/staff/counters/${counterId}/state`, {
      method: 'POST',
      body: JSON.stringify({ state }),
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
};
