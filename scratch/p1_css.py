import os, re
os.chdir(r'c:\Users\Superduash\Desktop\Projects\NeverQ')
p = 'frontend/src/index.css'
s = open(p, encoding='utf-8').read()
cut = s.index('/* ───────────── Shimmer & Marker Animation Keyframes')
tail = s[cut:]

head = r'''@import "tailwindcss";

@theme {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-heading: 'Sora', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Type scale: display 40/44 · h1 28/34 · h2 22/28 · h3 18/24 · body 16/24 · small 14/20 · caption 12/16 */
  --text-display: 2.5rem;
  --text-display--line-height: 2.75rem;
  --text-h1: 1.75rem;
  --text-h1--line-height: 2.125rem;
  --text-h2: 1.375rem;
  --text-h2--line-height: 1.75rem;
  --text-h3: 1.125rem;
  --text-h3--line-height: 1.5rem;
  --text-caption: 0.75rem;
  --text-caption--line-height: 1rem;

  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-faint: var(--ink-faint);
  --color-brand: var(--brand);
  --color-brand-2: var(--brand-2);
  --color-brand-soft: var(--brand-soft);
  --color-accent: var(--accent);
  --color-accent-2: var(--accent-2);
  --color-ring: var(--ring);
  --color-wait-good: var(--wait-good);
  --color-wait-mid: var(--wait-mid);
  --color-wait-bad: var(--wait-bad);
  --color-danger: var(--danger);
  --color-success: var(--success);
  --color-info: var(--info);
}

/* ───────────── Z-index scale (document order = stacking order) ─────────────
   map 0 < markers 5 (user marker 4, selected 10) < sheet 30 < tab bar 40
   < assistant FAB 45 < dialogs 60 < toasts 100                                   */
:root {
  --z-map: 0;
  --z-marker: 5;
  --z-sheet: 30;
  --z-tabbar: 40;
  --z-fab: 45;
  --z-dialog: 60;
  --z-toast: 100;

  --tabbar-h: calc(56px + env(safe-area-inset-bottom, 0px));
  --header-h: 64px;
}
@media (min-width: 1024px) {
  :root { --tabbar-h: 0px; }
}

/* ───────────── Light: "Lagoon Daylight" ───────────── */
[data-theme="light"], :root {
  --bg: #f2fafe;
  --bg-gradient:
    radial-gradient(520px 420px at 12% -4%, rgba(0, 180, 216, 0.14), transparent 70%),
    radial-gradient(480px 380px at 92% 8%, rgba(255, 107, 87, 0.08), transparent 70%),
    linear-gradient(180deg, #f2fafe 0%, #e8f6fc 100%);
  --surface: #ffffff;
  --surface-2: #eaf6fb;
  --surface-hover: #dff1f9;
  --surface-active: #cfe9f5;
  --surface-glass: rgba(255, 255, 255, 0.86);

  --border: rgba(0, 119, 182, 0.14);
  --border-strong: rgba(0, 119, 182, 0.28);
  --ring: #0077b6;

  --ink: #05234a;
  --ink-muted: #38577f;
  --ink-faint: #5d7799;

  --brand: #0077b6;
  --brand-2: #00b4d8;
  --brand-soft: rgba(0, 119, 182, 0.10);
  --brand-gradient: linear-gradient(135deg, #0077b6 0%, #00b4d8 100%);

  --accent: #ff6b57;
  --accent-2: #ffb703;
  --demo-text: #8a5a00;

  --shadow-glow: 0 6px 20px -4px rgba(0, 119, 182, 0.38);
  --shadow-card: 0 1px 2px rgba(5, 35, 74, 0.04), 0 8px 30px rgba(0, 119, 182, 0.10);
  --shadow-sheet: 0 -10px 40px -6px rgba(5, 35, 74, 0.18);

  --wait-good: #10b981;
  --wait-good-bg: #d6f5e8;
  --wait-good-text: #065f46;
  --wait-mid: #f59e0b;
  --wait-mid-bg: #fdf0cf;
  --wait-mid-text: #8a4b08;
  --wait-bad: #ef4444;
  --wait-bad-bg: #fde0e0;
  --wait-bad-text: #a11b1b;

  --danger: #e03131;
  --success: #10b981;
  --info: #0284c7;

  --tint-1-fg: #0077b6; --tint-1-bg: #dff1fb;
  --tint-2-fg: #0f9d6b; --tint-2-bg: #d9f5ea;
  --tint-3-fg: #d97706; --tint-3-bg: #fdecc8;
  --tint-4-fg: #7c3aed; --tint-4-bg: #ece4fd;
  --tint-5-fg: #e11d74; --tint-5-bg: #fde0ee;
  --tint-6-fg: #0e7490; --tint-6-bg: #d3f1f7;

  --map-filter: none;
}

/* ───────────── Dark: "Midnight Reef" ───────────── */
[data-theme="dark"] {
  --bg: #00111c;
  --bg-gradient:
    radial-gradient(560px 440px at 10% -6%, rgba(0, 150, 199, 0.18), transparent 70%),
    radial-gradient(480px 380px at 94% 10%, rgba(167, 139, 250, 0.10), transparent 70%),
    linear-gradient(180deg, #00111c 0%, #002137 100%);
  --surface: #00192b;
  --surface-2: #002137;
  --surface-hover: #00294a;
  --surface-active: #003356;
  --surface-glass: rgba(0, 20, 34, 0.86);

  --border: rgba(56, 189, 248, 0.16);
  --border-strong: rgba(56, 189, 248, 0.30);
  --ring: #38bdf8;

  --ink: #eef8ff;
  --ink-muted: #b6dcf3;
  --ink-faint: #8fb0c9;

  --brand: #1aa9d6;
  --brand-2: #00c2e8;
  --brand-soft: rgba(26, 169, 214, 0.18);
  --brand-gradient: linear-gradient(135deg, #0a86b8 0%, #00b4d8 100%);

  --accent: #f472b6;
  --accent-2: #a78bfa;
  --demo-text: #c4b5fd;

  --shadow-glow: 0 0 22px -2px rgba(0, 194, 232, 0.45);
  --shadow-card: 0 0 0 1px rgba(56, 189, 248, 0.14), 0 10px 28px -10px rgba(0, 0, 0, 0.7);
  --shadow-sheet: 0 -12px 40px 0 rgba(0, 0, 0, 0.7);

  --wait-good: #5af0c4;
  --wait-good-bg: rgba(90, 240, 196, 0.16);
  --wait-good-text: #5af0c4;
  --wait-mid: #fbbf24;
  --wait-mid-bg: rgba(251, 191, 36, 0.16);
  --wait-mid-text: #fcd34d;
  --wait-bad: #fb7185;
  --wait-bad-bg: rgba(251, 113, 133, 0.20);
  --wait-bad-text: #fda4af;

  --danger: #fb7185;
  --success: #5af0c4;
  --info: #38bdf8;

  --tint-1-fg: #7dd3fc; --tint-1-bg: rgba(56, 189, 248, 0.16);
  --tint-2-fg: #5af0c4; --tint-2-bg: rgba(90, 240, 196, 0.14);
  --tint-3-fg: #fcd34d; --tint-3-bg: rgba(251, 191, 36, 0.14);
  --tint-4-fg: #c4b5fd; --tint-4-bg: rgba(167, 139, 250, 0.18);
  --tint-5-fg: #f9a8d4; --tint-5-bg: rgba(244, 114, 182, 0.16);
  --tint-6-fg: #67e8f9; --tint-6-bg: rgba(34, 211, 238, 0.14);

  --map-filter: none;
}

/* ───────────── Base ───────────── */
html {
  font-size: 16px;
  min-height: 100%;
  overflow-x: clip;
  background-color: var(--bg);
  scroll-padding-top: 80px;
}
html[data-text="large"] { font-size: 18px; }

body {
  margin: 0;
  min-height: 100dvh;
  overflow-x: clip;
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: 1.5;
  background-color: var(--bg);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
  text-size-adjust: 100%;
}

/* Fixed atmosphere layer (cheaper than background-attachment: fixed) */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--bg-gradient);
  pointer-events: none;
}

#root {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  letter-spacing: -0.015em;
}

.touch-target {
  min-height: 44px;
  min-width: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.tnum { font-variant-numeric: tabular-nums; }

.pt-safe { padding-top: env(safe-area-inset-top, 0px); }
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
.pl-safe { padding-left: env(safe-area-inset-left, 0px); }
.pr-safe { padding-right: env(safe-area-inset-right, 0px); }

/* Page padding: 16 / 24 / 32 */
.page-pad { padding-inline: 16px; }
@media (min-width: 640px) { .page-pad { padding-inline: 24px; } }
@media (min-width: 1024px) { .page-pad { padding-inline: 32px; } }

/* Section label (replaces tiny uppercase micro-labels) */
.section-label {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
  color: var(--ink-muted);
}

.skip-link {
  position: fixed;
  left: 16px;
  top: -64px;
  z-index: 200;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-weight: 600;
  transition: top 0.15s ease;
}
.skip-link:focus { top: 12px; }

:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}

input, select, textarea {
  color: var(--ink);
  background-color: var(--surface);
  font-size: 16px; /* prevents iOS zoom */
}
input::placeholder, textarea::placeholder {
  color: var(--ink-faint) !important;
  opacity: 0.9 !important;
}
select option { background-color: var(--surface); color: var(--ink); }

:disabled, [aria-disabled="true"] { cursor: not-allowed; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: var(--brand); }

/* ───────────── Motion utilities ───────────── */
@keyframes nq-enter {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.page-enter { animation: nq-enter 180ms ease-out both; }

@keyframes nq-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
/* Staggered list entrance: set style={{ '--i': index }} (max 8 steps) */
.stagger-in {
  animation: nq-rise 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(min(var(--i, 0), 8) * 40ms);
}

@keyframes nq-hero-drift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
.hero-mesh {
  background-image:
    radial-gradient(60% 80% at 15% 20%, rgba(0, 180, 216, 0.28), transparent 70%),
    radial-gradient(50% 70% at 85% 10%, rgba(255, 107, 87, 0.16), transparent 70%),
    linear-gradient(120deg, rgba(0, 119, 182, 0.10), rgba(0, 180, 216, 0.04), rgba(0, 119, 182, 0.10));
  background-size: 160% 160%;
  animation: nq-hero-drift 18s ease-in-out infinite;
}
[data-theme="dark"] .hero-mesh {
  background-image:
    radial-gradient(60% 80% at 15% 20%, rgba(0, 194, 232, 0.22), transparent 70%),
    radial-gradient(50% 70% at 85% 10%, rgba(167, 139, 250, 0.18), transparent 70%),
    linear-gradient(120deg, rgba(0, 51, 86, 0.6), rgba(0, 33, 55, 0.2), rgba(0, 51, 86, 0.6));
}

.gradient-text {
  background: var(--brand-gradient);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.lift { transition: transform 0.15s ease, box-shadow 0.15s ease; }
.lift:hover { transform: translateY(-2px); }

/* Glass is for sticky bars only (not list cards) */
.glass-bar {
  background: var(--surface-glass);
  border-bottom: 1px solid var(--border);
}
@media (min-width: 768px) {
  .glass-bar { backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
}
.glass-tabbar {
  background: var(--surface-glass);
  border-top: 1px solid var(--border);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

/* Scroll-snap row with edge fade (chips) */
.snap-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 20px), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 12px, #000 calc(100% - 20px), transparent 100%);
  padding-inline: 12px;
}
.snap-row::-webkit-scrollbar { display: none; }

'''

tail = tail.replace('\n.shimmer-box {', '\n.shimmer-box {', 1)

# ── tail fixes ──
tail = tail.replace('''.maplibregl-map {
  font-family: var(--font-sans) !important;
}''', '''.maplibregl-map {
  font-family: var(--font-sans) !important;
  isolation: isolate;
  z-index: var(--z-map);
}''')
tail = tail.replace('''  z-index: 50 !important;
  user-select: none;
  pointer-events: none !important;''', '''  z-index: 4 !important;
  user-select: none;
  pointer-events: none !important;''')
tail = tail.replace('''  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);''', '''  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);''')
tail = tail.replace('''  font-weight: 600;
  font-size: 11px;
  max-width: 105px;''', '''  font-weight: 600;
  font-size: 12px;
  max-width: 105px;''')
tail = tail.replace('''  color: var(--ink-faint) !important;
  font-size: 10px !important;
  padding: 2px 8px !important;
  border-radius: 6px !important;''', '''  color: var(--ink-faint) !important;
  font-size: 12px !important;
  padding: 2px 8px !important;
  border-radius: 6px !important;''')
tail = tail.replace('''  font-size: 10px !important;
  line-height: 1.2 !important;
  color: var(--ink-muted) !important;''', '''  font-size: 12px !important;
  line-height: 1.2 !important;
  color: var(--ink-muted) !important;''')
tail = tail.replace('''.nq-marker-pill:hover {
  transform: scale(1.1) translateY(-2px);
  z-index: 10 !important;
}

.nq-marker-pill.selected {
  transform: scale(1.18) translateY(-3px);
  outline: 3px solid var(--accent) !important;
  outline-offset: 2px !important;
  z-index: 20 !important;
}''', '''.nq-marker-pill:hover {
  transform: scale(1.08) translateY(-2px);
}

.nq-marker-pill.selected {
  transform: scale(1.14) translateY(-3px);
  outline: 3px solid var(--brand) !important;
  outline-offset: 2px !important;
}

.maplibregl-marker:has(.nq-marker-pill.selected) { z-index: 10 !important; }
.maplibregl-marker:has(.nq-marker-pill) { z-index: var(--z-marker); }

@keyframes nq-marker-pop {
  0% { opacity: 0; transform: scale(0.6); }
  70% { transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}
.nq-marker-pill { animation: nq-marker-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both; }''')

# replace toaster overrides
i = tail.index('/* ───────────── Sonner Toaster Overrides')
tail = tail[:i] + '''/* ───────────── Toasts ───────────── */
[data-sonner-toaster] { z-index: var(--z-toast) !important; }
'''
# remove old map-filter dependent text (kept above)
open(p, 'w', encoding='utf-8').write(head + tail)
print('css ok', len(head + tail))
