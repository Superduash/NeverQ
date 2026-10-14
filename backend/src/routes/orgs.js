// backend/src/routes/orgs.js
// Public org/hospital read endpoints (Part 2.3)
// GET /api/orgs           – list with wait ETAs and optional travel estimates
// GET /api/orgs/:id       – single org detail with full departments
// GET /api/orgs/:id/board – public wait board

import { Router } from 'express';
import { Org, Department, Counter, Ticket, Settings } from '../db/models/index.js';
import { estimateTravel } from '../services/travel/estimate.js';
import { getQueueSnapshot } from '../services/eta/recompute.js';
import { compareWaitingTickets } from '../services/eta/engine.js';
import { now } from '../lib/clock.js';

const router = Router();

/**
 * Format a single org document with all its departments and live queue/ETA snapshots.
 */
async function formatOrgDetail(org, origin = null, rushFactor = 1.0, deptFilter = null) {
  // Query all departments for this org
  let deptDocs = await Department.find({ orgId: org._id }).sort({ order: 1 }).lean();

  // Populate departments with live counters and queue snapshots
  let departments = await Promise.all(
    deptDocs.map(async (d) => {
      const counters = await Counter.find({ orgId: org._id, deptKey: d.key }).lean();
      const waitingCount = await Ticket.countDocuments({
        orgId: org._id,
        deptKey: d.key,
        status: 'waiting',
      });

      let eta = null;
      let confidence = 'Estimating';
      let confidenceLevel = 'low';

      try {
        const snapshot = await getQueueSnapshot(org._id, d.key);
        eta = snapshot.newJoiner;
        confidence = snapshot.confidence;
        confidenceLevel = snapshot.confidenceLevel || 'low';
      } catch (err) {
        console.warn(`[Orgs] Could not get ETA snapshot for ${org._id}:${d.key}:`, err.message);
      }

      return {
        id: d.key,
        name: d.name,
        code: d.code,
        defaultMin: d.defaultMin,
        waitingCount,
        countersOpen: counters.filter((c) => c.state === 'open').length,
        countersTotal: counters.length,
        eta,
        confidence,
        confidenceLevel,
      };
    })
  );

  // If deptFilter is given, reorder departments so matching department is first
  if (deptFilter && typeof deptFilter === 'string') {
    const q = deptFilter.trim().toLowerCase();
    if (q && q !== 'all') {
      const matchIdx = departments.findIndex(
        (d) => d.id.toLowerCase() === q || d.name.toLowerCase().includes(q)
      );
      if (matchIdx > 0) {
        const matched = departments[matchIdx];
        departments = [matched, ...departments.filter((_, idx) => idx !== matchIdx)];
      }
    }
  }

  const resDoc = {
    id: org._id,
    name: org.name,
    category: org.category || 'hospital',
    open: org.open !== false,
    lat: org.lat,
    lng: org.lng,
    area: org.area,
    address: org.address,
    hours: org.hours || '08:00–20:00',
    rules: org.rules || {},
    departments,
  };

  // Only attach distance & travel if valid origin coordinates were provided
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    const travel = estimateTravel(origin, { lat: org.lat, lng: org.lng }, 'car', rushFactor);
    resDoc.distanceKm = travel.km;
    resDoc.travelMin = travel.minutes;
  }

  return resDoc;
}

// GET /api/orgs
router.get('/', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    const { lat, lng, dept, search } = req.query;

    const filter = {};
    if (search && typeof search === 'string' && search.trim()) {
      filter.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { area: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const [orgs, settings] = await Promise.all([
      Org.find(filter).lean(),
      Settings.findById('global').lean(),
    ]);

    const rushFactor = settings?.rushFactor || 1.0;

    // Validate origin coordinates; do NOT default to a fake origin
    const validLat = lat !== undefined && lat !== null && lat !== '' && Number.isFinite(Number(lat));
    const validLng = lng !== undefined && lng !== null && lng !== '' && Number.isFinite(Number(lng));
    const origin = validLat && validLng ? { lat: Number(lat), lng: Number(lng) } : null;

    let formattedList = await Promise.all(
      orgs.map((org) => formatOrgDetail(org, origin, rushFactor, dept))
    );

    // If dept filter is active and not 'All', only return hospitals containing matching dept
    if (dept && typeof dept === 'string') {
      const q = dept.trim().toLowerCase();
      if (q && q !== 'all') {
        formattedList = formattedList.filter((org) =>
          org.departments.some(
            (d) => d.id.toLowerCase() === q || d.name.toLowerCase().includes(q)
          )
        );
      }
    }

    // Sort by distanceKm if origin provided, otherwise by hospital name
    if (origin) {
      formattedList.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    } else {
      formattedList.sort((a, b) => a.name.localeCompare(b.name));
    }

    res.json(formattedList);
  } catch (err) {
    next(err);
  }
});

// GET /api/orgs/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    const org = await Org.findById(req.params.id).lean();
    if (!org) {
      return res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Hospital not found',
      });
    }

    const settings = await Settings.findById('global').lean();
    const rushFactor = settings?.rushFactor || 1.0;

    const validLat = req.query.lat !== undefined && Number.isFinite(Number(req.query.lat));
    const validLng = req.query.lng !== undefined && Number.isFinite(Number(req.query.lng));
    const origin = validLat && validLng ? { lat: Number(req.query.lat), lng: Number(req.query.lng) } : null;

    const formatted = await formatOrgDetail(org, origin, rushFactor, null);
    res.json(formatted);
  } catch (err) {
    next(err);
  }
});

// GET /api/orgs/:id/board (Public Wait Board)
router.get('/:id/board', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    const org = await Org.findById(req.params.id).lean();
    if (!org) {
      return res.status(404).json({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Hospital not found',
      });
    }

    const { deptId } = req.query;
    const allDepts = await Department.find({ orgId: org._id }).sort({ order: 1 }).lean();
    const targetDepts = deptId ? allDepts.filter((d) => d.key === deptId) : allDepts;

    const departments = await Promise.all(
      targetDepts.map(async (dept) => {
        const counters = await Counter.find({ orgId: org._id, deptKey: dept.key }).lean();

        // For each counter, find active ticket if serving or called
        const populatedCounters = await Promise.all(
          counters.map(async (c) => {
            let nowServing = null;
            if (c.currentTicketId) {
              const activeTicket = await Ticket.findById(c.currentTicketId).lean();
              if (activeTicket) {
                nowServing = {
                  id: activeTicket._id,
                  label: activeTicket.label,
                  status: activeTicket.status, // 'called' | 'serving'
                  calledAt: activeTicket.calledAt,
                };
              }
            }

            return {
              id: c._id,
              name: c.name,
              state: c.state,
              nowServing,
            };
          })
        );

        // Find next 5 waiting tickets (strictly privacy safe: NO names or phones)
        const activeTickets = await Ticket.find({
          orgId: org._id,
          deptKey: dept.key,
          status: { $in: ['waiting', 'called'] },
        }).lean();

        const counterTicketIds = new Set(
          counters.map((c) => c.currentTicketId?.toString()).filter(Boolean)
        );

        const waiting = activeTickets
          .filter((t) => t.status === 'waiting' || !counterTicketIds.has(t._id.toString()))
          .sort(compareWaitingTickets)
          .slice(0, 5)
          .map((t) => ({
            id: t._id,
            label: t.label,
            arrived: Boolean(t.arrived),
            urgent: Boolean(t.urgent),
            priority: t.priority,
          }));

        // Flatten serving counters into active serving list
        const serving = populatedCounters
          .filter((c) => c.nowServing)
          .map((c) => ({
            counterId: c.id,
            counterName: c.name,
            label: c.nowServing.label,
            status: c.nowServing.status,
            calledAt: c.nowServing.calledAt,
          }));

        return {
          id: dept.key,
          name: dept.name,
          counters: populatedCounters,
          serving,
          waiting,
        };
      })
    );

    res.json({
      org: {
        id: org._id,
        name: org.name,
        area: org.area,
        address: org.address,
        departments: allDepts.map((d) => ({ id: d.key, name: d.name })),
      },
      departments,
      updatedAt: now(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
