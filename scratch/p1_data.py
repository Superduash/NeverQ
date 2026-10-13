import re, os
os.chdir(r'c:\Users\Superduash\Desktop\Projects\NeverQ')
p = 'frontend/src/lib/mock/engine.js'
s = open(p, encoding='utf-8').read()
s = s.replace("import { haversine, estimateTravel } from '../mock.js';", "import { haversine, estimateTravel } from '../geo.js';")
s = s.replace("const STORAGE_KEY = 'nq-mock-db';", "const STORAGE_KEY = 'nq-mock-db-v2';")
a = s.index('// Seed some initial patients')
b = s.index('// ───────────── Event Emitter')
s = s[:a] + "// Queues start empty: tickets exist only when a patient joins, staff add a walk-in,\n// or the Demo Director simulates patients.\nconst INITIAL_TICKETS = [];\n\n" + s[b:]
open(p, 'w', encoding='utf-8').write(s)

p = 'frontend/src/lib/utils.js'
s = open(p, encoding='utf-8').read()
s = s.replace("export const WAIT_THRESHOLDS = {\n  good: 15,\n  bad: 40,\n};\n", "import { WAIT_THRESHOLDS } from './constants.js';\nexport { WAIT_THRESHOLDS };\n")
open(p, 'w', encoding='utf-8').write(s)

if os.path.exists('frontend/src/lib/mock.js'):
    os.remove('frontend/src/lib/mock.js')
print('ok')
