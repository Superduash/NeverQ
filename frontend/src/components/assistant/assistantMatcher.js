/**
 * Pure rule-based matcher for NeverQ Guided Helper (Phase C).
 * Transparent, deterministic keyword matching without fake AI or LLMs.
 */

// Critical Emergency Symptoms -> Immediate Hard Safety Stop
export const EMERGENCY_KEYWORDS = [
  'chest pain',
  'heart attack',
  'bleeding',
  'heavy bleeding',
  'unconscious',
  'passed out',
  'cannot breathe',
  "can't breathe",
  'difficulty breathing',
  'stroke',
  'paralysis',
  'slurred speech',
  'seizure',
  'convulsion',
  'poison',
  'overdose',
  'suicide',
  'head trauma',
  'severe burn',
];

// Department Keyword Mapping
export const DEPARTMENT_KEYWORD_MAP = {
  'Eye Clinic': [
    'eye', 'eyes', 'vision', 'sight', 'blur', 'blurry',
    'spectacles', 'glasses', 'optometry', 'cataract',
    'itchy eyes', 'red eye', 'ophthalmology'
  ],
  'Cardiology': [
    'heart', 'palpitation', 'palpitations', 'high bp',
    'blood pressure', 'hypertension', 'cardiac',
    'cardiologist', 'heartbeat'
  ],
  'Orthopaedics': [
    'bone', 'bones', 'fracture', 'joint', 'knee',
    'shoulder', 'sprain', 'ankle', 'back pain', 'spine',
    'ortho', 'orthopaedics', 'arthritis', 'ligament'
  ],
  'Pharmacy': [
    'medicine', 'medicines', 'pill', 'pills', 'prescription',
    'pharmacy', 'refill', 'chemist', 'dispensing'
  ],
  'General OPD': [
    'fever', 'cold', 'cough', 'flu', 'headache',
    'stomach', 'belly', 'general', 'checkup', 'routine',
    'consultation', 'doctor', 'physician', 'weakness', 'vomit', 'vomiting'
  ],
};

/**
 * Checks if the text triggers medical emergency red flags.
 */
export function checkEmergency(query) {
  const text = query.toLowerCase();
  for (const keyword of EMERGENCY_KEYWORDS) {
    if (text.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Matches input text to the most relevant department and best hospital.
 */
export function matchNeedToDepartment(query, hospitals = []) {
  const text = query.toLowerCase();

  // 1. Emergency safety check
  if (checkEmergency(text)) {
    return {
      type: 'emergency',
      message: 'Medical Emergency Alert: Your query mentions potential emergency symptoms. Please call 112 immediately or visit the nearest emergency room directly. Remote queuing is not suitable for emergencies.',
    };
  }

  // 2. Identify target department
  let matchedDeptName = null;
  let highestScore = 0;

  for (const [deptName, keywords] of Object.entries(DEPARTMENT_KEYWORD_MAP)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        score += 1;
      }
    }
    if (score > highestScore) {
      highestScore = score;
      matchedDeptName = deptName;
    }
  }

  // Default to General OPD if asked broadly for "doctor", "appointment", "hospital", "nearest", or "fastest"
  if (!matchedDeptName) {
    if (text.includes('fastest') || text.includes('nearest') || text.includes('doctor') || text.includes('appointment')) {
      matchedDeptName = 'General OPD';
    }
  }

  if (!matchedDeptName) {
    return {
      type: 'no_match',
      message: "I couldn't identify a specific specialty from your request. Please choose from our common departments below or describe your symptoms:",
    };
  }

  // 3. Find hospitals offering this department
  const eligibleHospitals = hospitals.filter((h) =>
    h.departments?.some((d) => d.name === matchedDeptName)
  );

  if (eligibleHospitals.length === 0) {
    return {
      type: 'no_hospitals',
      deptName: matchedDeptName,
      message: `No nearby hospitals currently offer live queues for "${matchedDeptName}". Would you like to check General OPD instead?`,
    };
  }

  // Rank by fastest wait time for the matched department
  const ranked = eligibleHospitals.map((h) => {
    const dept = h.departments.find((d) => d.name === matchedDeptName);
    const waitMid = dept?.eta?.mid || 15;
    const travelMin = h.travelMin || 12;
    const totalMin = waitMid + travelMin;
    return {
      hospital: h,
      dept,
      waitMid,
      travelMin,
      totalMin,
    };
  }).sort((a, b) => a.totalMin - b.totalMin);

  const best = ranked[0];

  return {
    type: 'recommendation',
    deptName: matchedDeptName,
    hospital: best.hospital,
    dept: best.dept,
    waitMid: best.waitMid,
    travelMin: best.travelMin,
    totalMin: best.totalMin,
    alternatives: ranked.slice(1, 3),
    message: `For ${matchedDeptName}, ${best.hospital.name} is currently your fastest option with ~${best.dept.eta.low}–${best.dept.eta.high} min wait (~${best.travelMin}m travel).`,
  };
}
