// backend/src/lib/clock.js
// Centralized time source for queue logic and demo fast-forward.
// Queue logic MUST call now(), NEVER Date.now() directly.

let clockOffsetMs = 0;
let rushFactor = 1.0;

export const clock = {
  /**
   * Get current demo-aware time in milliseconds (UTC).
   */
  now() {
    return Date.now() + clockOffsetMs;
  },

  /**
   * Get current offset in milliseconds.
   */
  getOffsetMs() {
    return clockOffsetMs;
  },

  /**
   * Set the demo clock offset in milliseconds.
   */
  setOffsetMs(ms) {
    clockOffsetMs = Math.round(Number(ms) || 0);
    return clockOffsetMs;
  },

  /**
   * Alias for setOffsetMs
   */
  setOffset(ms) {
    return this.setOffsetMs(ms);
  },

  /**
   * Adjust offset by delta minutes.
   */
  addMinutes(minutes) {
    clockOffsetMs += Math.round((Number(minutes) || 0) * 60000);
    return clockOffsetMs;
  },

  /**
   * Advance offset by milliseconds.
   */
  forwardMs(ms) {
    clockOffsetMs += Math.round(Number(ms) || 0);
    return clockOffsetMs;
  },

  /**
   * Reset clock offset to 0.
   */
  reset() {
    clockOffsetMs = 0;
    rushFactor = 1.0;
  },

  /**
   * Get global rush factor.
   */
  getRushFactor() {
    return rushFactor;
  },

  /**
   * Set global rush factor.
   */
  setRushFactor(factor) {
    rushFactor = Math.max(0.5, Math.min(3.0, Number(factor) || 1.0));
    return rushFactor;
  },
};

export const now = () => clock.now();
export default clock;
