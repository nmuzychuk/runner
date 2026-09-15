import { describe, it, expect } from 'vitest';
import {
  objectsOverlap,
  firstCollision,
  overlappingItems,
} from '../../js/core/collision.js';

const player = (over = {}) => ({
  lane: 1,
  z: 0,
  invuln: 0,
  ...over,
});

const obj = (over = {}) => ({
  id: 1,
  type: 'car',
  lane: 1,
  z: 0,
  hazard: true,
  item: false,
  ...over,
});

describe('objectsOverlap', () => {
  it('collides when same lane and z within window', () => {
    expect(objectsOverlap(player(), obj({ z: 0 }))).toBe(true);
    expect(objectsOverlap(player(), obj({ z: 1.5 }))).toBe(true);
    expect(objectsOverlap(player(), obj({ z: -1.5 }))).toBe(true);
  });

  it('does not collide when outside the z window', () => {
    expect(objectsOverlap(player(), obj({ z: 1.6 }))).toBe(false);
    expect(objectsOverlap(player(), obj({ z: -10 }))).toBe(false);
  });

  it('does not collide on a different lane', () => {
    expect(objectsOverlap(player(), obj({ lane: 0 }))).toBe(false);
    expect(objectsOverlap(player({ lane: 0 }), obj({ lane: 1 }))).toBe(false);
  });

  it('never collides while player is invulnerable', () => {
    expect(objectsOverlap(player({ invuln: 0.5 }), obj())).toBe(false);
  });

  it('debris: high in the air does not hit, once fallen to road level it does', () => {
    const air = obj({ type: 'debris', y: 10 }); // still falling, above the player
    expect(objectsOverlap(player(), air)).toBe(false);
    const landed = obj({ type: 'debris', y: 1.2 }); // in the collision band
    expect(objectsOverlap(player(), landed)).toBe(true);
    const ground = obj({ type: 'debris', y: 0 });
    expect(objectsOverlap(player(), ground)).toBe(true);
  });

  it('drone: at flight altitude it hits, below the road it misses', () => {
    const flying = obj({ type: 'drone', y: 1.6 });
    expect(objectsOverlap(player(), flying)).toBe(true);
    const low = obj({ type: 'drone', y: 0.3 });
    expect(objectsOverlap(player(), low)).toBe(false);
  });

  it('barricade: hits on the ground, is cleared by a jump', () => {
    const barrier = obj({ type: 'barricade', y: 0 });
    expect(objectsOverlap(player(), barrier)).toBe(true);
    expect(objectsOverlap(player({ y: 0.3 }), barrier)).toBe(false); // airborne
  });

  it('debris: a landed chunk is cleared by a jump', () => {
    const landed = obj({ type: 'debris', y: 0 });
    expect(objectsOverlap(player(), landed)).toBe(true);
    expect(objectsOverlap(player({ y: 0.25 }), landed)).toBe(false);
  });

  it('car: too tall to jump over — jumping does NOT save you', () => {
    const wreck = obj({ type: 'car', y: 0 });
    expect(objectsOverlap(player(), wreck)).toBe(true);
    expect(objectsOverlap(player({ y: 0.3 }), wreck)).toBe(true);
    expect(objectsOverlap(player({ y: 0.75 }), wreck)).toBe(true); // apex
  });

  it('drone: ducking (crouch) slips underneath it', () => {
    const flying = obj({ type: 'drone', y: 1.6 });
    expect(objectsOverlap(player(), flying)).toBe(true);
    expect(objectsOverlap(player({ crouch: true }), flying)).toBe(false);
  });

  it('drone: crouching does not help against a grounded car', () => {
    const wreck = obj({ type: 'car', y: 0 });
    expect(objectsOverlap(player({ crouch: true }), wreck)).toBe(true);
  });
});

describe('firstCollision', () => {
  it('returns null when nothing overlaps', () => {
    expect(firstCollision(player(), [obj({ lane: 0 }), obj({ z: 5 })])).toBeNull();
  });

  it('ignores items and returns the first overlapping hazard', () => {
    const item = obj({ type: 'water', hazard: false, item: true, id: 10 });
    const hazardA = obj({ id: 11, z: 0.5 });
    const hazardB = obj({ id: 12, z: 1 });
    const found = firstCollision(player(), [item, hazardA, hazardB]);
    expect(found).toBe(hazardA);
  });
});

describe('overlappingItems', () => {
  it('returns only overlapping items', () => {
    const goodItem = obj({ id: 1, type: 'water', hazard: false, item: true, z: 0 });
    const badItem = obj({ id: 2, type: 'water', hazard: false, item: true, lane: 0 });
    const farItem = obj({ id: 3, type: 'water', hazard: false, item: true, z: 9 });
    const hazard = obj({ id: 4, z: 0 });
    const out = overlappingItems(player(), [goodItem, badItem, farItem, hazard]);
    expect(out).toEqual([goodItem]);
  });

  it('returns empty when invulnerable', () => {
    const item = obj({ type: 'water', hazard: false, item: true });
    expect(overlappingItems(player({ invuln: 1 }), [item])).toEqual([]);
  });
});
