// Golden Hour Canyon Run — all tunables in one place. One change here retunes the whole sortie.
export const STEP = 1 / 60;
export const WORLD = {
  seedDefault: 7,
  canyonLength: 2900, // runway B sits at z = -canyonLength
  canyonHalfWidth: 130, // canyon floor half-width
  wallHeight: 170, // mesa tops above the floor
  riverY: 1.2,
};

export const PLANE = {
  maxSpeed: 210, // knots-ish units per second at full throttle
  cruiseSpeed: 120,
  stallSpeed: 42, // below this the jet sinks
  accel: 55, // speed approaches throttle target at this rate
  turnRate: 0.85, // rad/s at full bank
  maxBank: 1.05, // rad
  pitchRate: 0.62,
  maxPitch: 0.65,
  sinkRate: 26, // vertical sink per second when stalled
  climbRate: 22, // max climb at full throttle
  fuelBurn: 0.55, // fuel % per second at full throttle
  fuelBurnIdle: 0.08,
  damagePerHit: 34,
  startFuel: 100,
};

export const RINGS = {
  count: 10, // Precision mode uses 8
  radius: 24,
  radiusPrecision: 14,
  firstZ: -260,
  lastZ: -2450,
  minAlt: 30,
  maxAlt: 90,
  score: 500,
};

export const RUNWAY = {
  a: { z: 0, length: 260, width: 26 }, // takeoff runway
  b: { z: -2900, length: 420, width: 30 }, // landing runway
  landingSpeedMax: 95, // above this the landing is too hot
  landingSinkMax: 9,
};

export const MODES = {
  run: { label: 'CANYON RUN', rings: 10, fuel: 100, timeLimit: 0, ringRadius: RINGS.radius },
  time: { label: 'TIME TRIAL', rings: 10, fuel: 100, timeLimit: 150, ringRadius: RINGS.radius },
  precision: { label: 'PRECISION', rings: 8, fuel: 80, timeLimit: 0, ringRadius: RINGS.radiusPrecision },
};

export const SCORE = {
  ring: 500,
  centerBonus: 250, // extra for crossing a ring within 0.35 of its radius of centre
  landing: 1000,
  fuelPerPoint: 10, // per fuel % left at landing
  timeBonusPerSecond: 8, // under par time, Canyon Run only
  parTime: 150,
};
