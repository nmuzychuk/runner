// Central, tunable game constants for Air Raid Runner.
// Kept framework-free (no three.js) so the whole core can be unit-tested in Node.

export const LANES = 3;
export const LANE_WIDTH = 2.4; // metres between lane centres

// World-space X position for a 0-based lane index (lane 1 is the centre lane).
// NOTE: the camera sits at negative z looking down +z, which is a 180° Y-rotation
// from three.js's default orientation — that flips screen left/right, so lane 0
// must map to +x (screen left) and lane 2 to -x (screen right). Keep it this way
// or ArrowLeft/ArrowRight will move the runner the wrong direction.
export const laneX = (lane) => ((LANES - 1) / 2 - lane) * LANE_WIDTH;

// Player body extents used for collision (metres).
export const PLAYER = {
  halfZ: 0.9,
  collisionZWindow: 1.5, // |obj.z - playerZ| <= this AND lane match => collision
  invulnTime: 1.1, // seconds of i-frames after taking a hit
};

// Running speed (m/s). Ramps up with distance travelled, capped.
export const SPEED = {
  base: 13,
  max: 34,
  accelPerMeter: 0.006,
};

// How speed scales: speed = base + distance * accelPerMeter, clamped to max.
export const speedFor = (distance) =>
  Math.min(SPEED.max, SPEED.base + distance * SPEED.accelPerMeter);

// Falling debris (shelling) parameters (y in world-space metres). A chunk
// spawns ~aheadDebris m ahead, drops from startY and lands on the road (y=0),
// then scrolls past as a normal ground obstacle. Tuned so it always lands in
// FRONT of the player (never "in the air" when it reaches them): the fall
// takes startY/speed ≈ 1s, during which the world moves speed·1s, so the
// landing point is aheadDebris − speed. At max speed (34) that's ~6m ahead.
export const FALL = { startY: 10, speed: 10, collisionY: 2, aheadDebris: 40 };
// Drones close on the player faster than the world scrolls (m/s extra).
export const DRONE_AHEAD_SPEED = 10;

// Player vertical actions. Jump clears debris + barricades (apex ~0.75 m,
// above their collision ceiling) but NOT cars (tall wreck). Crouch ducks the
// player under drones (head goes from ~1.6 m to ~0.9 m, under the drone's
// floor). Both are time-limited and can be extended by holding the key.
export const JUMP = {
  duration: 0.72, // full arc seconds (air time)
  height: 1.6, // peak feet height above the road (bigger player → bigger vault)
  minClearY: 0.2, // player clears a ground obstacle while feet are above this
};
export const CROUCH = {
  duration: 0.9, // one press ducks for this long; holding extends by dt
  headY: 0.9, // player head height while crouching (drones fly above this)
};

// Spawning. Objects appear `ahead` metres in front and stream toward the player.
export const SPAWN = {
  ahead: 46, // metres in front of the player where waves appear
  despawnBehind: 6, // metres behind the player before an object is removed
  gapBase: 20, // metres between waves at difficulty 0 (~20% sparser than the old 17)
  gapMin: 11, // metres between waves at difficulty 1 (~20% sparser than the old 9)
  maxHazardsPerWave: 3, // never all 3 lanes at once (always one escape lane)
};

// Difficulty ramps 0..1 over the first `rampTo` metres of running.
export const DIFFICULTY = { rampTo: 2200 };
export const difficultyFor = (distance) =>
  Math.min(1, Math.max(0, distance / DIFFICULTY.rampTo));

export const LIVES = { max: 3 };

// Hazard & item catalogue. `type` is the identity used by spawner, collision and renderer.
export const HAZARDS = ['debris', 'car', 'barricade', 'drone'];
export const ITEMS = ['phone', 'flashlight', 'water', 'firstaid'];

// Per-type visual/behaviour metadata (renderer reads these; core only needs the arrays).
export const TYPE_META = {
  debris: { hazard: true, label: 'Falling debris', falling: true, jumpable: true },
  car: { hazard: true, label: 'Wrecked car' }, // too tall to jump, too wide to duck
  barricade: { hazard: true, label: 'Barricade', jumpable: true },
  drone: { hazard: true, label: 'Drone', flying: true, flyY: 3.4, crouchable: true },
  phone: { item: true, label: 'Phone', oneTime: true, bonus: 250 },
  flashlight: { item: true, label: 'Flashlight', oneTime: true, bonus: 150 },
  water: { item: true, label: 'Water', bonus: 50 },
  firstaid: { item: true, label: 'First-aid kit', bonus: 100, heal: 1 },
};

// Score per metre of distance travelled.
export const SCORE = { perMeter: 1, milestoneEvery: 500 };
