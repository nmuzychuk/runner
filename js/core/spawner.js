// Pure spawn logic. Given the current distance travelled and a seeded RNG,
// decide whether a new "wave" of obstacles/items should appear, and if so,
// describe it as plain objects (no three.js). The Game class owns the objects
// list; the Spawner only tracks WHEN the next wave appears.
import { makeRng } from './rng.js';
import {
  SPAWN,
  HAZARDS,
  ITEMS,
  difficultyFor,
} from './config.js';

const lerp = (a, b, t) => a + (b - a) * t;

// Decide the contents of a single wave at a given difficulty (0..1).
// Guarantees at most 2 hazard lanes are blocked so there is always an escape lane.
export function makeWave(rng, difficulty) {
  // 1..2 hazards. Bias toward 2 as difficulty rises.
  const wantTwo = rng.bool(0.35 + 0.5 * difficulty);
  const nH = wantTwo ? 2 : 1;
  const lanes = rng.shuffle([0, 1, 2]);
  const hazards = lanes.slice(0, nH).map((lane) => ({
    type: rng.pick(HAZARDS),
    lane,
  }));

  // Occasionally drop a collectible in one of the free lanes.
  const out = hazards.slice();
  if (rng.bool(0.4)) {
    const free = lanes.slice(nH);
    out.push({ type: rng.pick(ITEMS), lane: rng.pick(free), item: true });
  }
  return out;
}

export class Spawner {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.rng = makeRng(seed);
    // First wave appears after the player has run `ahead` metres.
    this.nextSpawnAt = SPAWN.ahead;
    this.waves = 0;
  }

  reset(seed = this.seed) {
    this.seed = seed;
    this.rng = makeRng(seed);
    this.nextSpawnAt = SPAWN.ahead;
    this.waves = 0;
  }

  // Return any wave descriptors that should have appeared by `distance`.
  update(distance) {
    const out = [];
    // Guard against a pathological while-loop (e.g. huge dt in a stale tab).
    let guard = 0;
    while (distance >= this.nextSpawnAt && guard < 64) {
      guard++;
      const diff = difficultyFor(distance);
      out.push(...makeWave(this.rng, diff));
      const gap = lerp(SPAWN.gapBase, SPAWN.gapMin, diff) * this.rng.range(0.85, 1.2);
      this.nextSpawnAt += gap;
      this.waves++;
    }
    return out;
  }
}
