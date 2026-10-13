import maplibregl from 'maplibre-gl';

/**
 * Creates or updates a DOM marker for a hospital on MapLibre.
 */
export function createHospitalMarker({
  hospital,
  map,
  isSelected,
  onClick,
}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'nq-marker-container';

  const pill = document.createElement('div');
  pill.className = `nq-marker-pill ${isSelected ? 'selected' : ''}`;
  updatePillContent(pill, hospital, isSelected);

  wrapper.appendChild(pill);

  wrapper.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(hospital);
  });

  const marker = new maplibregl.Marker({ element: wrapper, anchor: 'center' })
    .setLngLat([hospital.lng, hospital.lat])
    .addTo(map);

  return { marker, wrapper, pill };
}

export function updateHospitalMarker({
  markerObj,
  hospital,
  isSelected,
}) {
  markerObj.marker.setLngLat([hospital.lng, hospital.lat]);
  markerObj.pill.className = `nq-marker-pill ${isSelected ? 'selected' : ''}`;
  updatePillContent(markerObj.pill, hospital, isSelected);
  markerObj.wrapper.style.zIndex = isSelected ? '30' : '10';
  markerObj.wrapper.setAttribute(
    'title',
    `${hospital.name} • ~${hospital.selectedDept?.eta?.mid || hospital.eta || 15}m wait`
  );
}

function updatePillContent(pill, hospital, isSelected) {
  const waitMid = hospital.selectedDept?.eta?.mid || hospital.eta || 15;
  const status = hospital.status || (waitMid <= 15 ? 'good' : waitMid <= 35 ? 'mid' : 'bad');

  pill.style.backgroundColor =
    status === 'good' ? 'var(--wait-good)' :
    status === 'mid' ? 'var(--wait-mid)' :
    'var(--wait-bad)';
  pill.style.color = '#ffffff';

  const shortName = hospital.name.replace(/ Hospital| Multi-speciality| Clinic/gi, '').trim();
  const starIcon = hospital.isSaved ? '<span style="color: #fbbf24; margin-right: 3px;">★</span>' : '';

  pill.innerHTML = `
    ${starIcon}
    <span class="nq-pill-time">~${waitMid}m</span>
    <span class="nq-pill-name">${shortName}</span>
  `;
}
