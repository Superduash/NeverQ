import maplibregl from 'maplibre-gl';

/**
 * Creates or updates the user location origin pin on MapLibre.
 */
export function createUserMarker({
  location,
  map,
  draggable = false,
  onDragEnd = null,
}) {
  const wrapper = document.createElement('div');
  wrapper.className = `nq-user-marker ${draggable ? 'is-draggable' : ''}`;
  wrapper.setAttribute('title', location.label || 'Your Origin Location');

  const badge = document.createElement('div');
  badge.className = 'nq-user-badge';
  badge.innerHTML = `<span>📍</span><span>${location.label || 'Your Location'}</span>`;
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
  markerObj.marker.setLngLat([location.lng, location.lat]);
  if (markerObj.badge) {
    markerObj.badge.innerHTML = `<span>📍</span><span>${location.label || 'Your Location'}</span>`;
  }
}
