// Seeded RNG (mulberry32) + value noise, so the same ?seed= always builds the same canyon.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 2D value noise in [-1, 1], built from the seed. */
export function makeNoise(seed) {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) base[i] = i;
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }
  for (let i = 0; i < 512; i += 1) perm[i] = base[i & 255];
  function hash(ix, iz) {
    return perm[(perm[ix & 255] + iz) & 255] / 255;
  }
  function smooth(t) {
    return t * t * (3 - 2 * t);
  }
  return function noise(x, z) {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const a = hash(ix, iz);
    const b = hash(ix + 1, iz);
    const c = hash(ix, iz + 1);
    const d = hash(ix + 1, iz + 1);
    const ux = smooth(fx);
    const uz = smooth(fz);
    const v = a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
    return v * 2 - 1;
  };
}

/** Fractal noise: 4 octaves of value noise. */
export function makeFbm(seed) {
  const noise = makeNoise(seed);
  return function fbm(x, z) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < 4; o += 1) {
      sum += amp * noise(x * freq, z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  };
}
