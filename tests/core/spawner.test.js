import { describe, it, expect } from 'vitest';
import { Spawner, makeWave } from '../../js/core/spawner.js';
import { HAZARDS, ITEMS, LANES } from '../../js/core/config.js';
import { makeRng } from '../../js/core/rng.js';

describe('makeWave', () => {
  it('always produces at least one hazard', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 50; i++) {
      const wave = makeWave(rng, 0.5);
      const hazards = wave.filter((w) => HAZARDS.includes(w.type));
      expect(hazards.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('never blocks all lanes (an escape lane always exists)', () => {
    const rng = makeRng(2);
    for (let i = 0; i < 200; i++) {
      const wave = makeWave(rng, 1);
      const hazardLanes = new Set(
        wave.filter((w) => HAZARDS.includes(w.type)).map((w) => w.lane),
      );
      expect(hazardLanes.size).toBeLessThan(LANES);
    }
  });

  it('uses valid lanes and hazard/item types', () => {
    const rng = makeRng(3);
    const wave = makeWave(rng, 0.3);
    for (const w of wave) {
      expect(w.lane).toBeGreaterThanOrEqual(0);
      expect(w.lane).toBeLessThan(LANES);
      expect([...HAZARDS, ...ITEMS]).toContain(w.type);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = makeWave(makeRng(42), 0.4);
    const b = makeWave(makeRng(42), 0.4);
    expect(a).toEqual(b);
  });
});

describe('Spawner', () => {
  it('emits nothing before the first spawn distance', () => {
    const s = new Spawner({ seed: 1 });
    expect(s.update(45)).toEqual([]);
  });

  it('emits a wave once distance reaches the first spawn point', () => {
    const s = new Spawner({ seed: 1 });
    const out = s.update(46);
    expect(out.length).toBeGreaterThanOrEqual(1);
  });

  it('schedules the next spawn further out after emitting', () => {
    const s = new Spawner({ seed: 1 });
    s.update(46);
    expect(s.nextSpawnAt).toBeGreaterThan(46);
  });

  it('is reproducible for the same seed', () => {
    const a = new Spawner({ seed: 7 });
    const b = new Spawner({ seed: 7 });
    const outA = a.update(200);
    const outB = b.update(200);
    expect(outA).toEqual(outB);
    expect(a.waves).toBe(b.waves);
  });
});
