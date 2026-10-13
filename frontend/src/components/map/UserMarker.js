import maplibregl from 'maplibre-gl';

/**
 * Returns a clear, unambiguous label for the origin marker.
 * - Demo coordinates -> 'Chennai demo area'
 * - Manually saved home -> 'Saved Home'
 * - Real GPS -> 'Your GPS Location'
 */
export function getOriginMarkerLabel(location) {
  if (!location) return 'Chennai demo area';
  if (location.type === 'demo' || location.id === 'demo' || location.isDemo) {
    return 'Chennai demo area';
  }
  if (location.type === 'saved' || location.id === 'saved_home' || location.isSaved) {
    return 'Saved Home';
  }
  if (location.type === 'gps' || location.id === 'gps' || location.isGPS) {
    return 'Your GPS Location';
  }
  if (location.type === 'pin' || location.id === 'custom') {
    return 'Custom Pin on Map';
  }
  return location.label || 'Origin Location';
}

/**
 * Creates or updates the user location origin pin on MapLibre.
 */
export function createUserMarker({
  location,
  map,
  draggable = false,
  onDragEnd = null,
}) {
  const displayLabel = getOriginMarkerLabel(location);
  const isDemo = location?.type === 'demo' || location?.id === 'demo' || location?.isDemo;

  const wrapper = document.createElement('div');
  wrapper.className = `nq-user-marker ${draggable ? 'is-draggable' : ''} ${isDemo ? 'is-demo-origin' : ''}`;
  wrapper.setAttribute('title', displayLabel);

  const badge = document.createElement('div');
  badge.className = 'nq-user-badge';
  badge.innerHTML = `<span>📍</span><span>${displayLabel}</span>`;
  wrapper.appendChild(badge);

  const pinWrap = document.createElement('div');
  pinWrap.className = 'nq-user-pin-wrap';

  const pulse = document.createElement('div');
  pulse.className = 'nq-user-pulse';
  pinWrap.appendChild(pulse);

  const pinIcon = document.createElement('div');
  pinIcon.className = 'nq-user-pin-icon';

  const inner = document.createElement('div');
  inner.className = 'nq-user-pin-inner';
  pinIcon.appendChild(inner);

  pinWrap.appendChild(pinIcon);
  wrapper.appendChild(pinWrap);

  const marker = new maplibregl.Marker({
    element: wrapper,
    anchor: 'bottom',
    draggable,
  })
    .setLngLat([location.lng, location.lat])
    .addTo(map);

  if (draggable && onDragEnd) {
    marker.on('dragend', () => {
      const lngLat = marker.getLngLat();
      onDragEnd({ lat: lngLat.lat, lng: lngLat.lng });
    });
  }

  return { marker, wrapper, badge };
}

export function updateUserMarker({
  markerObj,
  location,
}) {
  const displayLabel = getOriginMarkerLabel(location);
  markerObj.marker.setLngLat([location.lng, location.lat]);
  if (markerObj.badge) {
    markerObj.badge.innerHTML = `<span>📍</span><span>${displayLabel}</span>`;
  }
  if (markerObj.wrapper) {
    markerObj.wrapper.setAttribute('title', displayLabel);
  }
}
