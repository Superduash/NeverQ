// backend/test/unit/clock.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { clock, now } from '../../src/lib/clock.js';

describe('Clock utility', () => {
  beforeEach(() => {
    clock.reset();
  });

  it('now() defaults to real time when offset is 0', () => {
    const realNow = Date.now();
    const demoNow = now();
    expect(Math.abs(demoNow - realNow)).toBeLessThan(50);
  });

  it('now() reflects setOffsetMs', () => {
    const offset = 30 * 60 * 1000; // 30 minutes
    clock.setOffsetMs(offset);
    expect(clock.getOffsetMs()).toBe(offset);

    const realNow = Date.now();
    const demoNow = now();
    expect(Math.abs(demoNow - (realNow + offset))).toBeLessThan(50);
  });

  it('addMinutes correctly advances offset', () => {
    clock.addMinutes(15);
    expect(clock.getOffsetMs()).toBe(15 * 60 * 1000);

    clock.addMinutes(10);
    expect(clock.getOffsetMs()).toBe(25 * 60 * 1000);
  });

  it('reset() sets offset back to 0 and rushFactor to 1.0', () => {
    clock.setOffsetMs(50000);
    clock.setRushFactor(1.5);
    clock.reset();

    expect(clock.getOffsetMs()).toBe(0);
    expect(clock.getRushFactor()).toBe(1.0);
  });

  it('setRushFactor clamps values between 0.5 and 3.0', () => {
    clock.setRushFactor(0.2);
    expect(clock.getRushFactor()).toBe(0.5);

    clock.setRushFactor(5.0);
    expect(clock.getRushFactor()).toBe(3.0);

    clock.setRushFactor(1.4);
    expect(clock.getRushFactor()).toBe(1.4);
  });
});
