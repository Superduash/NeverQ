import os, re
os.chdir(r'c:\Users\Superduash\Desktop\Projects\NeverQ')
p = 'frontend/src/lib/mock/engine.js'
s = open(p, encoding='utf-8').read()

# 1) replace fabricated listOrgs eta with a real "next joiner" projection
pat = re.compile(r"        const waitingTickets = this\.db\.tickets\.filter\(\(t\) => t\.orgId === org\.id && t\.deptId === d\.id && t\.status === 'waiting'\);\n        const openCounters = d\.counters\.filter\(\(c\) => c\.state === 'open'\);\n\n        let eta = \{ low: 5, mid: 12, high: 18 \};.*?        \}\n\n        return \{\n          id: d\.id,", re.S)
m = pat.search(s)
assert m, 'listOrgs eta block not found'
new_block = """        const waitingTickets = this.db.tickets.filter((t) => t.orgId === org.id && t.deptId === d.id && t.status === 'waiting');
        const openCounters = d.counters.filter((c) => c.state === 'open');
        const eta = this.estimateNewJoinerEta(d, waitingTickets.length);

        return {
          id: d.id,"""
s = s[:m.start()] + new_block + s[m.end():]

# 2) add estimateNewJoinerEta before sweep section
marker = "  // ───────────── Sweep Engine"
helper = """  // Projected wait for a patient who joins right now (0 when a counter is idle and nobody waits)
  estimateNewJoinerEta(dept, waitingCount = 0) {
    const open = dept.counters.filter((c) => c.state === 'open');
    if (open.length === 0) return { low: 0, mid: 0, high: 0, noCounter: true };

    const expected = this.calculateExpectedDuration(dept);
    const spread = expected * 0.35;
    const now = this.now();

    const freeAt = open.map((c) => {
      let t = now;
      if (c.delayUntil && c.delayUntil > t) t = c.delayUntil;
      if (c.currentTicketId) t += expected * 60 * 1000 * 0.5;
      return t;
    });

    for (let i = 0; i < waitingCount; i += 1) {
      freeAt.sort((a, b) => a - b);
      freeAt[0] += expected * 60 * 1000;
    }
    freeAt.sort((a, b) => a - b);

    const waitMin = Math.max(0, Math.round((freeAt[0] - now) / 60000));
    if (waitMin === 0) return { low: 0, mid: 0, high: 0 };
    const sp = Math.round(spread * Math.sqrt(waitingCount + 1));
    return { low: Math.max(1, waitMin - sp), mid: waitMin, high: waitMin + sp };
  }

"""
s = s.replace(marker, helper + marker, 1)
open(p, 'w', encoding='utf-8').write(s)
print('engine eta ok')
