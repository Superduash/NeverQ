/**
 * Helper to add or remove a polyline route layer on MapLibre GL.
 */
const ROUTE_SOURCE_ID = 'nq-route-source';
const ROUTE_LAYER_ID = 'nq-route-layer';
const ROUTE_CASING_ID = 'nq-route-casing';

export function setRouteLayer(map, coordinates = [], options = {}) {
  if (!map || !coordinates || coordinates.length < 2) {
    removeRouteLayer(map);
    return;
  }

  const applyRoute = () => {
    if (!map || !map.getStyle()) return;

    const geojson = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates, // Array of [lng, lat]
      },
    };

    try {
      const existingSource = map.getSource(ROUTE_SOURCE_ID);
      if (existingSource) {
        existingSource.setData(geojson);
        return;
      }

      map.addSource(ROUTE_SOURCE_ID, {
        type: 'geojson',
        data: geojson,
      });

      // Dark outline casing for contrast
      if (!map.getLayer(ROUTE_CASING_ID)) {
        map.addLayer({
          id: ROUTE_CASING_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': options.casingColor || '#0f172a',
            'line-width': options.casingWidth || 6,
            'line-opacity': 0.75,
          },
        });
      }

      // Main route color line (vivid cyan/blue)
      if (!map.getLayer(ROUTE_LAYER_ID)) {
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': options.color || '#2563eb',
            'line-width': options.width || 4.5,
            'line-opacity': 0.95,
          },
        });
      }
    } catch (err) {
      console.warn('Could not set route layer on map:', err);
    }
  };

  if (map.isStyleLoaded()) {
    applyRoute();
  } else {
    map.once('load', applyRoute);
    map.once('styledata', applyRoute);
  }
}

export function removeRouteLayer(map) {
  if (!map) return;
  try {
    if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
    if (map.getLayer(ROUTE_CASING_ID)) map.removeLayer(ROUTE_CASING_ID);
    if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
  } catch (err) {
    // Style might have changed or layer already removed
  }
}
