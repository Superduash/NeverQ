import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { MapPin, Check, X, LocateFixed, AlertTriangle } from 'lucide-react';
import { useMapStyle, OPENFREEMAP_STYLES } from './useMapStyle.js';
import { createHospitalMarker, updateHospitalMarker } from './HospitalMarker.js';
import { createUserMarker, updateUserMarker } from './UserMarker.js';
import { setRouteLayer, removeRouteLayer } from './RouteLayer.js';
import { MapControls } from './MapControls.jsx';
import { DEMO_HOME } from '../../lib/geo.js';

/**
 * Universal MapView component for NeverQ.
 * Modes:
 *  - 'browse': Interactive map with hospital wait pills, user location, and selection (Landing, HospitalView)
 *  - 'pick': Location crosshair pin picker for custom origin or Admin venue coords
 *  - 'ticket': Compact destination map with route polyline and arrival indicator
 */
export function MapView({
  markers = [],
  selected = null,
  user = null,
  mode = 'browse',
  onSelect = null,
  onPick = null,
  isPinMode = false,
  onCancelPin = null,
  sheetSnap = 'peek',
  isSidebarCollapsed = false,
  route = null,
  className = '',
  interactive = true,
  center = null,
  zoom = 12.0,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const hospitalMarkersRef = useRef(new Map());
  const userMarkerRef = useRef(null);
  const pickMarkerRef = useRef(null);
  const hasInitialFitRef = useRef(false);
  const prevUserCoordRef = useRef(user);

  const [mapError, setMapError] = useState(null);
  const [pickedCoords, setPickedCoords] = useState(null);

  const { resolvedTheme } = useMapStyle(mapRef);

  // Synchronized refs to avoid stale closures in MapLibre event listeners
  const isPinModeRef = useRef(isPinMode || mode === 'pick');
  const onPickRef = useRef(onPick);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    isPinModeRef.current = isPinMode || mode === 'pick';
  }, [isPinMode, mode]);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Determine initial coordinates
  const initialCenter = useMemo(() => {
    if (center && typeof center[0] === 'number' && typeof center[1] === 'number') {
      return center;
    }
    if (user && typeof user.lng === 'number' && typeof user.lat === 'number') {
      return [user.lng, user.lat];
    }
    if (markers.length > 0 && typeof markers[0].lng === 'number') {
      return [markers[0].lng, markers[0].lat];
    }
    return [DEMO_HOME.lng, DEMO_HOME.lat];
  }, [center, user, markers]);

  // ───────────── Initialize MapLibre ONCE on mount ─────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let mapInstance;
    let resizeTimer = null;
    let ro = null;

    const initialStyle = resolvedTheme === 'dark' ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.liberty;

    try {
      mapInstance = new maplibregl.Map({
        container: containerRef.current,
        style: initialStyle,
        center: initialCenter,
        zoom,
        interactive,
        attributionControl: false,
      });

      // Compact attribution bottom-right
      mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      mapInstance.on('load', () => {
        mapInstance.resize();
        setMapError(null);
      });

      mapInstance.on('error', (err) => {
        console.warn('MapLibre error handled:', err);
      });

      // Click listener with mutable ref checks to eliminate stale closure bugs
      mapInstance.on('click', (e) => {
        const coords = { lat: e.lngLat.lat, lng: e.lngLat.lng };

        if (onPickRef.current && (isPinModeRef.current || mode === 'ticket' || mode === 'pick')) {
          setPickedCoords(coords);
          onPickRef.current(coords);
          return;
        }

        if (mode === 'browse' && onSelectRef.current) {
          onSelectRef.current(null);
        }
      });

      // WebGL Context Guard: Prevent termination on tab switch or memory pressure
      const canvas = mapInstance.getCanvas();
      const onContextLost = (e) => {
        e.preventDefault();
        console.warn('Map WebGL context lost; preventing termination.');
      };
      const onContextRestored = () => {
        console.info('Map WebGL context restored; reloading style.');
        const currentTargetStyle = resolvedTheme === 'dark' ? OPENFREEMAP_STYLES.dark : OPENFREEMAP_STYLES.liberty;
        try {
          mapInstance.setStyle(currentTargetStyle, { diff: false });
        } catch (err) {
          console.warn('Deferred style reload error:', err);
        }
      };

      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);

      mapRef.current = mapInstance;

      // Debounced ResizeObserver: Prevents WebGL framebuffer thrashing during layout transitions
      ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          mapInstance?.resize();
        }, 120);
      });
      ro.observe(containerRef.current);
    } catch (err) {
      console.warn('MapLibre WebGL context creation error handled:', err);
      setMapError('Vector map rendering is disabled or unsupported in this browser configuration.');
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      ro?.disconnect();
      hospitalMarkersRef.current.forEach((m) => m.marker.remove());
      hospitalMarkersRef.current.clear();
      if (userMarkerRef.current) {
        (userMarkerRef.current.marker || userMarkerRef.current).remove();
        userMarkerRef.current = null;
      }
      if (pickMarkerRef.current) {
        pickMarkerRef.current.remove();
        pickMarkerRef.current = null;
      }
      mapInstance?.remove();
      mapRef.current = null;
    };
  }, []);

  // ───────────── Pin Mode Cursor ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const isPinning = isPinMode || mode === 'pick';
    try {
      const canvas = map.getCanvas();
      if (canvas) canvas.style.cursor = isPinning ? 'crosshair' : '';
      if (containerRef.current) containerRef.current.style.cursor = isPinning ? 'crosshair' : '';
    } catch (err) {
      // Safe guard
    }
  }, [isPinMode, mode]);

  // ───────────── Re-anchor markers on style load ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const onStyleData = () => {
      if (userMarkerRef.current && user && typeof user.lng === 'number' && typeof user.lat === 'number') {
        const m = userMarkerRef.current.marker || userMarkerRef.current;
        m.setLngLat([user.lng, user.lat]);
      }
      if (route && route.length >= 2) {
        setRouteLayer(map, route);
      }
    };

    map.on('styledata', onStyleData);
    return () => {
      map.off('styledata', onStyleData);
    };
  }, [user, route]);

  // ───────────── Update Hospital Markers (Mode 'browse' or 'pick') ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentMarkers = hospitalMarkersRef.current;
    const activeIds = new Set(markers.map((h) => h.id));

    // Remove obsolete markers
    currentMarkers.forEach((markerObj, id) => {
      if (!activeIds.has(id)) {
        markerObj.marker.remove();
        currentMarkers.delete(id);
      }
    });

    // Add or update active markers
    markers.forEach((hospital) => {
      if (typeof hospital.lng !== 'number' || typeof hospital.lat !== 'number' || isNaN(hospital.lng) || isNaN(hospital.lat)) {
        return;
      }

      const isSelected = hospital.id === selected;
      let markerObj = currentMarkers.get(hospital.id);

      if (!markerObj) {
        markerObj = createHospitalMarker({
          hospital,
          map,
          isSelected,
          onClick: (clickedHosp) => {
            if (isPinModeRef.current && onPickRef.current) {
              setPickedCoords({ lat: clickedHosp.lat, lng: clickedHosp.lng });
              onPickRef.current({ lat: clickedHosp.lat, lng: clickedHosp.lng });
              return;
            }
            if (onSelectRef.current) {
              onSelectRef.current(clickedHosp.id);
            }
          },
        });
        currentMarkers.set(hospital.id, markerObj);
      } else {
        updateHospitalMarker({
          markerObj,
          hospital,
          isSelected,
        });
      }
    });
  }, [markers, selected]);

  // ───────────── Update User Location Origin Pin ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!user || typeof user.lng !== 'number' || typeof user.lat !== 'number' || isNaN(user.lng) || isNaN(user.lat)) {
      if (userMarkerRef.current) {
        (userMarkerRef.current.marker || userMarkerRef.current).remove();
        userMarkerRef.current = null;
      }
      return;
    }

    const canDrag = Boolean(onPickRef.current && (mode === 'ticket' || mode === 'pick' || isPinModeRef.current));
    if (!userMarkerRef.current) {
      userMarkerRef.current = createUserMarker({
        location: user,
        map,
        draggable: canDrag,
        onDragEnd: (coords) => {
          if (onPickRef.current) onPickRef.current(coords);
        },
      });
    } else {
      updateUserMarker({
        markerObj: userMarkerRef.current,
        location: user,
      });
    }
  }, [user]);

  // ───────────── Mode 'pick': Dedicated Pick Marker for Admin / Custom Picker ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'pick') {
      if (pickMarkerRef.current) {
        pickMarkerRef.current.remove();
        pickMarkerRef.current = null;
      }
      return;
    }

    const activePoint = pickedCoords || (center ? { lat: center[1], lng: center[0] } : user);
    if (!activePoint || typeof activePoint.lng !== 'number' || typeof activePoint.lat !== 'number') return;

    if (!pickMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'nq-user-marker is-draggable';
      el.style.cursor = 'grab';
      el.innerHTML = `
        <div class="nq-user-badge"><span>📍</span><span>Selected Pin</span></div>
        <div class="nq-user-pin-wrap">
          <div class="nq-user-pulse"></div>
          <div class="nq-user-pin-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
            <div class="nq-user-pin-inner"></div>
          </div>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true })
        .setLngLat([activePoint.lng, activePoint.lat])
        .addTo(map);

      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        const next = { lat: lngLat.lat, lng: lngLat.lng };
        setPickedCoords(next);
        if (onPickRef.current) onPickRef.current(next);
      });

      pickMarkerRef.current = marker;
    } else {
      pickMarkerRef.current.setLngLat([activePoint.lng, activePoint.lat]);
    }
  }, [mode, pickedCoords, center, user]);

  // ───────────── Route Polyline (Mode 'ticket' or active route) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (route && route.length >= 2) {
      setRouteLayer(map, route);
    } else {
      removeRouteLayer(map);
    }

    return () => {
      removeRouteLayer(map);
    };
  }, [route]);

  // ───────────── Smooth Center on User/Pick Change (After Initial Load) ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasInitialFitRef.current) return;

    const target = mode === 'pick' && pickedCoords ? pickedCoords : user;
    if (
      target &&
      typeof target.lng === 'number' &&
      typeof target.lat === 'number' &&
      (prevUserCoordRef.current?.lat !== target.lat || prevUserCoordRef.current?.lng !== target.lng)
    ) {
      prevUserCoordRef.current = target;
      map.flyTo({
        center: [target.lng, target.lat],
        zoom: Math.max(map.getZoom(), 12.8),
        duration: 700,
      });
    }
  }, [user, pickedCoords, mode]);

  // ───────────── Initial FitBounds to Results & User ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hasInitialFitRef.current) return;
    if (markers.length === 0 && !user) return;

    const bounds = new maplibregl.LngLatBounds();
    let validCoords = 0;

    markers.forEach((m) => {
      if (typeof m.lng === 'number' && typeof m.lat === 'number' && !isNaN(m.lng) && !isNaN(m.lat)) {
        bounds.extend([m.lng, m.lat]);
        validCoords++;
      }
    });

    if (user && typeof user.lng === 'number' && typeof user.lat === 'number') {
      bounds.extend([user.lng, user.lat]);
      validCoords++;
    }

    if (validCoords > 0 && !bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: { top: 60, bottom: 60, left: 60, right: 60 },
        maxZoom: 13.5,
        duration: 800,
      });
      hasInitialFitRef.current = true;
    }
  }, [markers, user]);

  // ───────────── EaseTo Selected Hospital ─────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;

    const target = markers.find((m) => m.id === selected);
    if (target && typeof target.lng === 'number' && typeof target.lat === 'number') {
      map.easeTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 13), duration: 500 });
    }
  }, [selected, markers]);

  // ───────────── Resize Observer for Drawers/Sidebar Settlement ─────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      mapRef.current?.resize();
    }, 320);
    return () => clearTimeout(timer);
  }, [isSidebarCollapsed, sheetSnap]);

  // ───────────── Control Actions ─────────────
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (user && typeof user.lng === 'number' && typeof user.lat === 'number') {
      map.flyTo({ center: [user.lng, user.lat], zoom: 13, duration: 600 });
      return;
    }

    if (markers.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      markers.forEach((m) => bounds.extend([m.lng, m.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13.5, duration: 600 });
    }
  }, [user, markers]);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 });
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 });
  }, []);

  const handleResetNorth = useCallback(() => {
    mapRef.current?.resetNorthPitch({ duration: 400 });
  }, []);

  return (
    <div
      className={`relative w-full h-full min-h-[260px] overflow-hidden select-none ${className}`}
      role="region"
      aria-label="Interactive hospital map"
    >
      {/* MapLibre DOM Container */}
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />

      {/* Screen Reader Announcement Region */}
      <div className="sr-only" aria-live="polite">
        Interactive map showing {markers.length} hospitals. Origin set to {user?.label || 'Chennai demo area'}.
      </div>

      {/* Fallback Banner for WebGL Unavailable */}
      {mapError && (
        <div className="absolute inset-x-4 top-4 z-40 p-3.5 rounded-2xl bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] shadow-[var(--shadow-card)] flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--ink-faint)]">
            <AlertTriangle size={16} className="text-[var(--accent-2)] shrink-0" />
            <span>{mapError}</span>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      {interactive && !mapError && (
        <MapControls
          onRecenter={handleRecenter}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onResetNorth={handleResetNorth}
        />
      )}

      {/* Pin Mode Overlay Prompt */}
      {(isPinMode || mode === 'pick') && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[var(--surface)]/95 backdrop-blur-md border-2 border-[var(--brand)] text-[var(--ink)] shadow-[var(--shadow-lg)] text-xs font-bold animate-in fade-in zoom-in-95 duration-200">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--brand)] animate-ping" />
          <span>Click on the map or drag the green pin to pick location</span>
          {onCancelPin && (
            <button
              type="button"
              onClick={onCancelPin}
              className="ml-2 px-2.5 py-1 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[var(--ink-muted)] text-[11px] font-semibold border border-[var(--border)] transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
