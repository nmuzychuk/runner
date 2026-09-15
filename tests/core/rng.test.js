import { describe, it, expect } from 'vitest';
import { mulberry32, makeRng } from '../../js/core/rng.js';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('differs across seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('produces floats in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('makeRng', () => {
  it('range stays within bounds', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 50; i++) {
      const v = rng.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
    }
  });

  it('int returns integers within inclusive bounds', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 50; i++) {
      const v = rng.int(1, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('bool returns a boolean', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 20; i++) {
      expect(typeof rng.bool(0.3)).toBe('boolean');
    }
  });

  it('pick returns an element of the array', () => {
    const rng = makeRng(5);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 30; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('shuffle preserves elements and returns a copy', () => {
    const rng = makeRng(8);
    const src = [1, 2, 3, 4, 5];
    const out = rng.shuffle(src);
    expect(out).toHaveLength(src.length);
    expect([...out].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    // mutating the copy does not affect the original
    out.push(99);
    expect(src).toHaveLength(5);
  });

  it('reproduces the same sequence for the same seed', () => {
    const a = makeRng(1234);
    const b = makeRng(1234);
    const seqA = Array.from({ length: 10 }, () => a.range(0, 100));
    const seqB = Array.from({ length: 10 }, () => b.range(0, 100));
    expect(seqA).toEqual(seqB);
  });
});
