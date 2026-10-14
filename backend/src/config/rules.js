// backend/src/config/rules.js
// Authoritative constants for ETA calculations, queues, arrival, travel, and abuse control.
// Every constant documents its exact source (NeverQ2 § or [refinement]).

export const RULES = {
  // ───────────── Phase 4 ETA Engine Constants (NeverQ2 §4, BackendQ.md §4.1) ─────────────

  /** Prior weight in Bayesian consultation duration blend. Source: NeverQ2 §4.1 */
  K: 3,

  /** Default prior spread fraction (0.35 * defaultMin). Source: NeverQ2 §4.2 */
  DEFAULT_SPREAD_FRAC: 0.35,

  /** Standard deviation floor fraction (0.20 * expected). Source: [refinement] prevents tiny m2 from producing falsely tight range */
  SD_FLOOR_FRAC: 0.20,

  /** Samples shorter than 1 min are ignored. Source: NeverQ2 §4.7, BackendQ.md §4.1 */
  MIN_SAMPLE_MIN: 1,

  /** Samples longer than 4 * defaultMin are clamped. Source: NeverQ2 §4.1, BackendQ.md §4.1 */
  MAX_SAMPLE_MULT: 4,

  /** Z-score for ~80% two-sided normal prediction interval. Source: NeverQ2 §4.4, BackendQ.md §4.1 */
  Z80: 1.28,

  /** Minimum absolute threshold |Δ| >= 2 min to record a change log entry. Source: NeverQ2 §4.6 */
  CHANGE_THRESHOLD_MIN: 2,

  /** Overrun remainder fraction (0.25 * expected). Source: NeverQ2 §4.3 */
  OVERRUN_REMAINDER_FRAC: 0.25,

  /** Overrun remainder minimum (2 min). Source: NeverQ2 §4.3 */
  OVERRUN_REMAINDER_MIN: 2,

  /** Overrun standard deviation widening factor (0.50 * expected). Source: [refinement] widens range when consultation overran */
  OVERRUN_SD_FRAC: 0.50,

  /** Delay standard deviation fraction (0.25 * remaining delay). Source: [refinement] staff delay is itself an estimate */
  DELAY_SD_FRAC: 0.25,

  /** Assumed transit time from "called" to "started" (1 min). Source: [refinement] BackendQ.md §4.1 */
  CALLED_WALK_MIN: 1,

  /** Minimum half-width for positive wait (1 min). Source: [refinement] avoids zero-width range for positive wait */
  MIN_HALF_WIDTH: 1,

  // ───────────── Phase 5 Arrival Radius Constants (NeverQ2 §6, BackendQ.md §5.2) ─────────────

  /** Base arrival geofence radius in meters. Source: NeverQ2 §6.3, BackendQ.md §1.2 C15 */
  ARRIVAL_RADIUS_M: 300,

  /** Maximum reported GPS accuracy allowance capped in meters. Source: NeverQ2 §6.3 */
  ARRIVAL_ACCURACY_CAP_M: 100,

  // ───────────── Organization & Department Default Rules (NeverQ2 §3, §9) ─────────────

  DEFAULT_DEPT_RULES: {
    /** Priority credit in minutes subtracted from joinedAt to yield sortKey. Source: NeverQ2 §3.3 */
    priorityCreditMin: {
      senior: 20,
      pregnant: 20,
      disabled: 20,
      none: 0,
    },
    /** Arrive-by deadline in minutes before estimated consultation start. Source: NeverQ2 §3.4 */
    arriveByMin: 15,
    /** Grace period in minutes after arrive-by deadline before ticket is requeued. Source: NeverQ2 §3.5 */
    graceMin: 5,
    /** Maximum active remote tickets allowed per hospital. Source: NeverQ2 §3.1 */
    remoteCap: 10,
    /** Whether remote ticketing is currently enabled. Source: NeverQ2 §3.1 */
    remoteEnabled: true,
  },

  // ───────────── Phase 5 Travel Model Constants (BackendQ.md §5.3, D-1) ─────────────

  TRAVEL_MODEL: {
    walk: { speedKmh: 4.5, roadFactor: 1.20, overheadMin: 0, rushShare: 0 },
    bike: { speedKmh: 14.0, roadFactor: 1.25, overheadMin: 1, rushShare: 0.5 },
    car: { speedKmh: 22.0, roadFactor: 1.35, overheadMin: 4, rushShare: 1.0 },
  },

  // ───────────── Rate Limits & Abuse Thresholds (NeverQ2 §8, BackendQ.md §3) ─────────────

  RATE_LIMITS: {
    JOIN_PER_DEVICE: 8,       // Source: NeverQ2 §8 anti-spam (8 joins / 10 min)
    JOIN_PER_IP: 60,          // Source: BackendQ.md Appendix C (60 joins / 10 min)
    TRAVEL_PER_IP: 30,        // Source: BackendQ.md §5.5 (30 / 1 min)
    ARRIVE_PER_TOKEN: 20,     // Source: BackendQ.md §1.2 C15 (20 / 10 min)
    STAFF_LOGIN: 10,          // Source: BackendQ.md §3.1 (10 / 10 min per IP+org)
    ADMIN_LOGIN: 5,           // Source: BackendQ.md §3.2 (5 / 10 min per IP)
  },
};

export default RULES;
