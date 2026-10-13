import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import {
  Search, MapPin, Navigation, Zap, Footprints, Bike, Car, Bus, List, Map as MapIcon, X, LocateFixed,
  Moon, Sun, Info, ExternalLink, HeartPulse, RefreshCw, Clock, Users,
} from 'lucide-react';
import {
  DEMO_CENTER, DEPARTMENTS, TRAVEL_MODES, WAIT_THRESHOLDS, HOSPITALS,
  getResults, haversineKm, formatKm, waitStatus,
} from '../lib/mock.js';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const MODE_ICON = { walk: Footprints, bike: Bike, drive: Car, transit: Bus };
const STATUS_LABEL = { good: 'Short', mid: 'Moderate', bad: 'Long' };
const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;
const fitPadding = () => (isMobile() ? { top: 70, bottom: 190, left: 40, right: 40 } : { top: 90, bottom: 90, left: 90, right: 90 });
const osmLink = (h) => `https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=16/${h.lat}/${h.lng}`;

/* ───────────── Small presentational pieces ───────────── */
function WaitBadge({ status, text, withLabel = true }) {
  return (
    <span className="wait" data-status={status}>
      <i className="dot" />
      {withLabel ? `${STATUS_LABEL[status]} · ${text}` : text}
    </span>
  );
}

function HospitalCard({ r, selected, mode, onSelect, onJoin }) {
  const ModeIcon = MODE_ICON[mode.id];
  return (
    <div id={`card-${r.id}`} className="card" data-selected={selected} onClick={() => onSelect(r.id)}>
      <div className="flex items-start justify-between gap-2">
        <h3><button type="button" onClick={() => onSelect(r.id)}>{r.name}</button></h3>
      </div>
      <div className="sub">
        <span className="demo">Demo data</span>
        <span>{r.area}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <WaitBadge status={r.status} text={r.waitText} />
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{r.wait.label}</span>
      </div>
      <div className="meta tnum">
        <span title="Estimated from straight-line distance"><ModeIcon size={14} />~{r.travel} min {mode.label.toLowerCase()} (est.)</span>
        <span><MapPin size={14} />{formatKm(r.km)} km</span>
        <span><Users size={14} />{r.wait.open}/{r.wait.total} counters open</span>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onJoin(r.id); }}>Join</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onSelect(r.id); }}>Details</button>
      </div>
    </div>
  );
}

function DetailPanel({ r, mode, notice, onClose, onJoin }) {
  const ModeIcon = MODE_ICON[mode.id];
  return (
    <aside className="detail" aria-label={`${r.name} details`}>
      <div className="head">
        <div className="flex flex-col gap-1.5">
          <h2>{r.name}</h2>
          <div className="sub"><span className="demo">Demo data</span><span>{r.area}</span></div>
        </div>
        <button type="button" className="icon-btn" style={{ width: 30, height: 30, borderRadius: 10 }} onClick={onClose} aria-label="Close details"><X size={16} /></button>
      </div>
      <div className="stats">
        <div className="stat"><small>Wait · {r.wait.label}</small><b>{r.waitText}</b></div>
        <div className="stat"><small>Travel (est.)</small><b className="flex items-center gap-1"><ModeIcon size={13} />~{r.travel} min</b></div>
        <div className="stat"><small>Distance</small><b>{formatKm(r.km)} km</b></div>
      </div>
      <div className="meta">
        <span><Clock size={14} />{r.hours}</span>
        <span><Users size={14} />{r.wait.open}/{r.wait.total} counters open</span>
      </div>
      <div className="depts" aria-label="Wait by department">
        {Object.entries(r.depts).map(([name, d]) => (
          <div key={name}>
            <span>{name}</span>
            <span className="flex items-center gap-2">
              <WaitBadge status={waitStatus((d.min + d.max) / 2)} text={`${d.min}–${d.max} min`} withLabel={false} />
              <span>{d.open}/{d.total}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={() => onJoin(r.id)}>Join queue</button>
        <a className="btn btn-ghost" href={osmLink(r)} target="_blank" rel="noreferrer">Map <ExternalLink size={13} /></a>
      </div>
      {notice && <p className="note" role="status">{notice}</p>}
      <p className="tiny">{r.address}. Waits, counters and hours are fictional demo data. Travel time is a straight-line estimate, not live routing.</p>
    </aside>
  );
}

/* ───────────── MapLibre map ───────────── */
function MapView({ items, selectedId, onSelect, userLoc, visible }) {
  const box = useRef(null);
  const markers = useRef(new Map());
  const userMarker = useRef(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [map, setMap] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // Create the map once (and again on retry); always clean up.
  useEffect(() => {
    let loaded = false, dead = false, timer, ro, m;
    setError('');
    setReady(false);
    try {
      m = new maplibregl.Map({
        container: box.current,
        style: MAP_STYLE,
        center: [DEMO_CENTER.lng, DEMO_CENTER.lat],
        zoom: 11.5,
        attributionControl: false,
      });
    } catch (e) {
      setError('Your browser couldn’t start the interactive map (WebGL may be unavailable).');
      return undefined;
    }
    m.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('load', () => { loaded = true; clearTimeout(timer); setError(''); setReady(true); });
    m.on('error', () => { if (!loaded && !dead) setError('The map style or tiles couldn’t be loaded. Check your connection and retry.'); });
    timer = setTimeout(() => { if (!loaded && !dead) setError('The map is taking too long to load.'); }, 15000);
    ro = new ResizeObserver(() => m.resize());
    ro.observe(box.current);
    setMap(m);
    return () => {
      dead = true;
      clearTimeout(timer);
      ro.disconnect();
      markers.current.forEach((x) => x.marker.remove());
      markers.current.clear();
      userMarker.current?.remove();
      userMarker.current = null;
      m.remove();
      setMap(null);
    };
  }, [attempt]);

  // Hospital markers with wait-time badges.
  useEffect(() => {
    if (!map) return;
    const cur = markers.current;
    const ids = new Set(items.map((i) => i.id));
    cur.forEach((v, id) => { if (!ids.has(id)) { v.marker.remove(); cur.delete(id); } });
    items.forEach((it) => {
      let rec = cur.get(it.id);
      if (!rec) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'mk';
        el.innerHTML = '<span class="mk-badge"></span><span class="mk-pin"></span>';
        el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(it.id); });
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([it.lng, it.lat]).addTo(map);
        rec = { el, marker };
        cur.set(it.id, rec);
      }
      rec.el.dataset.status = it.status;
      rec.el.setAttribute('aria-label', `${it.name}, ${it.waitText} wait (demo data)`);
      rec.el.firstChild.textContent = it.waitShort;
    });
  }, [map, items, onSelect]);

  // Selected marker highlight.
  useEffect(() => {
    markers.current.forEach((v, id) => {
      v.el.classList.toggle('is-selected', id === selectedId);
      v.el.style.zIndex = id === selectedId ? 2 : 1;
    });
  }, [map, items, selectedId]);

  // User location marker (only exists after the user clicks "Use my location").
  useEffect(() => {
    if (!map) return;
    userMarker.current?.remove();
    userMarker.current = null;
    if (userLoc) {
      const el = document.createElement('div');
      el.className = 'mk-user';
      el.setAttribute('aria-label', 'Your location');
      userMarker.current = new maplibregl.Marker({ element: el }).setLngLat([userLoc.lng, userLoc.lat]).addTo(map);
    }
  }, [map, userLoc]);

  // Fit bounds around visible hospitals (also when the map becomes visible on mobile).
  const key = items.map((i) => i.id).sort().join();
  useEffect(() => {
    if (!map || !ready || !visible || !itemsRef.current.length) return;
    map.resize();
    const pts = [...itemsRef.current];
    if (userLoc) pts.push(userLoc);
    if (pts.length === 1) { map.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: 14, duration: 600 }); return; }
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 15, duration: 600 });
  }, [map, ready, visible, key, userLoc]);

  // Fly to the selected hospital (offset so it clears the details panel).
  useEffect(() => {
    if (!map || !visible || !selectedId) return;
    const it = itemsRef.current.find((i) => i.id === selectedId);
    if (it) map.easeTo({ center: [it.lng, it.lat], zoom: Math.max(map.getZoom(), 13.5), offset: isMobile() ? [0, -110] : [180, 0], duration: 600 });
  }, [map, visible, selectedId]);

  return (
    <>
      <div ref={box} className="map" role="region" aria-label="Map of nearby demo hospitals" />
      {!ready && !error && <div className="maploading">Loading map…</div>}
      {error && (
        <div className="mapfail" role="alert">
          <div>
            <h2>Map unavailable</h2>
            <p>{error} The hospital list still works — you can also open each location in OpenStreetMap.</p>
            <div><button type="button" className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}><RefreshCw size={14} />Retry map</button></div>
            {items.map((h) => (
              <div key={h.id} className="fallrow">
                <button type="button" style={{ all: 'unset', cursor: 'pointer' }} onClick={() => onSelect(h.id)}>{h.name} · <span className="tnum">{h.waitText}</span></button>
                <a href={osmLink(h)} target="_blank" rel="noreferrer">OSM <ExternalLink size={12} /></a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ───────────── Page ───────────── */
export default function Landing() {
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('All');
  const [sort, setSort] = useState('nearest');
  const [mode, setMode] = useState('drive');
  const [selectedId, setSelectedId] = useState(null);
  const [userLoc, setUserLoc] = useState(null);
  const [loc, setLoc] = useState({ busy: false, msg: '' });
  const [view, setView] = useState('list'); // mobile only: 'list' | 'map'
  const [dark, setDark] = useState(false);
  const [notice, setNotice] = useState('');

  const origin = userLoc || DEMO_CENTER;
  const results = useMemo(() => getResults({ query, dept, sort, mode, origin }), [query, dept, sort, mode, origin]);
  const selected = results.find((r) => r.id === selectedId) || null;
  const modeObj = TRAVEL_MODES.find((m) => m.id === mode);

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    if (selectedId) document.getElementById(`card-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const select = useCallback((id) => { setSelectedId(id); setNotice(''); }, []);
  const openDetails = (id) => { select(id); setView('map'); };
  const join = (id) => {
    setSelectedId(id);
    setNotice('Queue joining isn’t built yet — this is a landing-page demo.');
    setView('map');
  };

  // Geolocation is requested ONLY when the button is clicked.
  const locate = () => {
    if (!navigator.geolocation) {
      setLoc({ busy: false, msg: 'Location isn’t available in this browser. Showing the demo area.' });
      return;
    }
    setLoc({ busy: true, msg: '' });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const me = { lat: p.coords.latitude, lng: p.coords.longitude, label: 'Your location' };
        if (haversineKm(me, DEMO_CENTER) > 60) {
          setLoc({ busy: false, msg: 'You’re outside the Chennai demo area, so the map stays on the demo area.' });
          return;
        }
        setUserLoc(me);
        setLoc({ busy: false, msg: 'Using your location for estimates.' });
      },
      (err) => setLoc({
        busy: false,
        msg: err.code === 1 ? 'Location permission denied. Showing the demo area.' : 'Couldn’t get your location. Showing the demo area.',
      }),
      { timeout: 10000, maximumAge: 60000 }
    );
  };
  const resetLocation = () => { setUserLoc(null); setLoc({ busy: false, msg: 'Back to the Chennai demo area.' }); };

  return (
    <div className="app" data-view={view}>
      <h1 className="sr-only">Nearby hospitals and live wait times (demo)</h1>

      <header className="controls">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="logo" aria-hidden="true"><HeartPulse size={18} /></span>
            <span className="font-display text-xl font-semibold tracking-tight">NeverQ</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="seg only-mobile" role="group" aria-label="Switch view">
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={14} />List</button>
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon size={14} />Map</button>
            </div>
            <button type="button" className="icon-btn" onClick={() => setDark((d) => !d)} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        <label className="search">
          <Search size={16} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search hospital, area or department" aria-label="Search hospitals" />
        </label>

        <div className="chips" role="group" aria-label="Department filter">
          {['All', ...DEPARTMENTS].map((d) => (
            <button key={d} type="button" className="chip" aria-pressed={dept === d} onClick={() => setDept(d)}>{d}</button>
          ))}
        </div>

        <div className="row">
          <div className="seg" role="group" aria-label="Sort hospitals">
            <button type="button" aria-pressed={sort === 'nearest'} onClick={() => setSort('nearest')}><Navigation size={14} />Nearest</button>
            <button type="button" aria-pressed={sort === 'fastest'} onClick={() => setSort('fastest')} title="Estimated travel time plus wait"><Zap size={14} />Fastest</button>
          </div>
          <div className="seg" role="group" aria-label="Travel mode">
            {TRAVEL_MODES.map((m) => {
              const Icon = MODE_ICON[m.id];
              return (
                <button key={m.id} type="button" aria-pressed={mode === m.id} aria-label={m.label} onClick={() => setMode(m.id)}>
                  <Icon size={15} /><span className="lbl-d">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="locrow">
          <button type="button" className="btn btn-ghost btn-sm" onClick={locate} disabled={loc.busy}>
            <LocateFixed size={14} />{loc.busy ? 'Locating…' : 'Use my location'}
          </button>
          {userLoc && <button type="button" className="btn btn-ghost btn-sm" onClick={resetLocation}>Use demo area</button>}
          {loc.msg && <span className="locmsg" role="status"><Info size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /> {loc.msg}</span>}
        </div>
      </header>

      <section className="list" aria-label="Hospital results">
        <div className="listhead tnum">
          <span>{results.length} {results.length === 1 ? 'hospital' : 'hospitals'}</span>
          <span>Estimates from: {origin.label}</span>
        </div>
        {results.map((r) => (
          <HospitalCard key={r.id} r={r} mode={modeObj} selected={r.id === selectedId} onSelect={openDetails} onJoin={join} />
        ))}
        {!results.length && (
          <div className="empty">
            No demo hospitals match.<br />
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { setQuery(''); setDept('All'); }}>Clear filters</button>
          </div>
        )}
        <p className="foot">
          All hospitals, waits and counters are fictional demo data ({HOSPITALS.length} Chennai-area examples). Travel times are rough estimates from straight-line distance, not live routing. “Fastest” ranks by estimated travel plus wait.
        </p>
      </section>

      <main className="mapwrap">
        <MapView items={results} selectedId={selected?.id} onSelect={select} userLoc={userLoc} visible={view === 'map' || !isMobile()} />
        <div className="mapinfo">
          <span className="pill"><MapPin size={13} />{userLoc ? 'Your location' : 'Chennai demo area · not your location'}</span>
          <span className="pill legend" aria-label="Wait time colour legend">
            <i data-status="good" />&lt;{WAIT_THRESHOLDS.good}
            <i data-status="mid" />{WAIT_THRESHOLDS.good}–{WAIT_THRESHOLDS.bad}
            <i data-status="bad" />&gt;{WAIT_THRESHOLDS.bad} min
          </span>
        </div>
        {selected ? (
          <DetailPanel r={selected} mode={modeObj} notice={notice} onClose={() => setSelectedId(null)} onJoin={join} />
        ) : (
          <div className="hint">{results.length} demo {results.length === 1 ? 'hospital' : 'hospitals'} shown. Tap a marker for details.</div>
        )}
      </main>
    </div>
  );
}
