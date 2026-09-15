// Deterministic, seedable PRNG (mulberry32).
// Using a seeded RNG means the spawner is reproducible in unit tests
// and lets e2e tests force specific spawn patterns.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convenience object exposing common RNG ops on top of a `next()` float generator.
export function makeRng(seed = 1) {
  const next = mulberry32(seed);
  return {
    // float in [0, 1)
    next,
    // float in [min, max)
    range(min, max) {
      return min + (max - min) * next();
    },
    // integer in [min, max] inclusive
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next());
    },
    bool(p = 0.5) {
      return next() < p;
    },
    // pick a random element from a non-empty array
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // shuffle a copy of an array (Fisher-Yates), returns new array
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}
