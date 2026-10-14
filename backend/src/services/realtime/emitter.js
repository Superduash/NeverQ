// backend/src/services/realtime/emitter.js
// Authoritative Realtime Emitter for NeverQ (Part 2.4)
// Zero PII in payloads.

let ioInstance = null;

export function setIO(io) {
  ioInstance = io;
}

export function getIO() {
  return ioInstance;
}

/**
 * Emits queue:update { orgId } to 'orgs' and 'org:<orgId>'
 */
export function emitQueue(orgId) {
  if (!ioInstance) return;
  const payload = { orgId, ts: Date.now() };
  ioInstance.to('orgs').emit('queue:update', payload);
  if (orgId) {
    ioInstance.to(`org:${orgId}`).emit('queue:update', payload);
  }
}

/**
 * Emits ticket:update { token } to 'ticket:<token>'
 */
export function emitTicket(token) {
  if (!ioInstance || !token) return;
  ioInstance.to(`ticket:${token}`).emit('ticket:update', { token, ts: Date.now() });
}

/**
 * Emits ticket:called to 'ticket:<token>' and 'org:<orgId>'
 * Payload contains only non-PII token label, ticket id, counter name
 */
export function emitCalled(token, { ticket, counter, orgId }) {
  if (!ioInstance) return;
  const payload = {
    ticket: {
      id: ticket?.id || ticket?._id,
      label: ticket?.label,
    },
    counter: {
      id: counter?.id || counter?._id,
      name: counter?.name,
    },
    token,
    ts: Date.now(),
  };

  if (token) {
    ioInstance.to(`ticket:${token}`).emit('ticket:called', payload);
  }
  if (orgId) {
    ioInstance.to(`org:${orgId}`).emit('ticket:called', payload);
  }
}

/**
 * Emits stats:update to 'admin' room
 */
export function emitStats(data = {}) {
  if (!ioInstance) return;
  ioInstance.to('admin').emit('stats:update', { ...data, ts: Date.now() });
}

export default {
  setIO,
  getIO,
  emitQueue,
  emitTicket,
  emitCalled,
  emitStats,
};
