// frontend/scripts/check-demo-geometry.mjs
// Verifies demo geography constraints per BackendQ.md §0.4 and NeverQ2 §11

import { DEMO_HOME, LOCATION_PRESETS } from '../src/lib/geo.js';
import { haversine, estimateTravel } from '../src/lib/travelModel.js';

const SEED_HOSPITALS = [
  { id: 'harbour', name: 'Harbour Care Clinic', lat: 13.0338, lng: 80.2676 },
  { id: 'metro', name: 'Metro Mercy Hospital', lat: 13.0067, lng: 80.2570 },
  { id: 'lakeside', name: 'Lakeside General Hospital', lat: 13.0850, lng: 80.2101 },
];

console.log('--- NeverQ Demo Geometry Check ---');
console.log(`Demo Home origin: (${DEMO_HOME.lat}, ${DEMO_HOME.lng})\n`);

let nearest = null;
let minDistance = Infinity;
let allWithinRange = true;

for (const hosp of SEED_HOSPITALS) {
  const straightKm = haversine(DEMO_HOME, hosp);
  const walkEst = estimateTravel(DEMO_HOME, hosp, 'walk', 1.0);
  const bikeEst = estimateTravel(DEMO_HOME, hosp, 'bike', 1.0);
  const carEst = estimateTravel(DEMO_HOME, hosp, 'car', 1.0);
  const carRush = estimateTravel(DEMO_HOME, hosp, 'car', 1.3);

  console.log(`Hospital: ${hosp.name}`);
  console.log(`  Straight line: ${straightKm.toFixed(2)} km`);
  console.log(`  Walk:  ${walkEst.minutes} min (${walkEst.km} km)`);
  console.log(`  Cycle: ${bikeEst.minutes} min (${bikeEst.km} km)`);
  console.log(`  Car:   ${carEst.minutes} min (${carEst.km} km) [rush ×1.3: ${carRush.minutes} min]`);

  if (straightKm < minDistance) {
    minDistance = straightKm;
    nearest = hosp.id;
  }

  if (straightKm < 2.0 || straightKm > 8.0) {
    allWithinRange = false;
  }
}

console.log('\n--- Invariant Checks ---');
const nearestPass = nearest === 'harbour';
console.log(`1. Harbour Care is nearest: ${nearestPass ? 'PASS' : 'FAIL'} (${minDistance.toFixed(2)} km)`);
console.log(`2. All seed hospitals within 2–8 km: ${allWithinRange ? 'PASS' : 'FAIL'}`);

if (!nearestPass || !allWithinRange) {
  console.error('\nGeometry constraint check FAILED!');
  process.exit(1);
} else {
  console.log('\nAll geometry constraints PASSED successfully.');
}
