// backend/test/unit/geo.test.js
import { describe, it, expect } from 'vitest';
import { haversine, isWithinArrivalRadius } from '../../src/lib/geo.js';

describe('Geo utility', () => {
  const harbour = { lat: 13.0338, lng: 80.2676 };
  const point200m = { lat: 13.0350, lng: 80.2685 }; // ~165m
  const point500m = { lat: 13.0380, lng: 80.2700 }; // ~535m

  it('calculates zero distance for same coordinates', () => {
    expect(haversine(harbour, harbour)).toBe(0);
  });

  it('handles invalid coordinates gracefully', () => {
    expect(haversine(null, harbour)).toBe(0);
    expect(haversine({ lat: NaN, lng: 80 }, harbour)).toBe(0);
  });

  it('correctly calculates arrival radius within 300m without accuracy reporting', () => {
    const resultNear = isWithinArrivalRadius(point200m, harbour, 0);
    expect(resultNear.within).toBe(true);
    expect(resultNear.allowedM).toBe(300);

    const resultFar = isWithinArrivalRadius(point500m, harbour, 0);
    expect(resultFar.within).toBe(false);
    expect(resultFar.allowedM).toBe(300);
  });

  it('expands allowed arrival radius up to 100m for GPS accuracy', () => {
    // A point at 350m:
    const point350m = { lat: 13.0366, lng: 80.2690 }; // ~340m
    const withoutAccuracy = isWithinArrivalRadius(point350m, harbour, 0);
    const withAccuracy = isWithinArrivalRadius(point350m, harbour, 60);

    expect(withoutAccuracy.within).toBe(false);
    expect(withAccuracy.allowedM).toBe(360);
    expect(withAccuracy.within).toBe(true);
  });

  it('caps GPS accuracy expansion at 100m (max 400m total)', () => {
    const result = isWithinArrivalRadius(harbour, harbour, 500);
    expect(result.allowedM).toBe(400); // 300 + min(500, 100)
  });
});
