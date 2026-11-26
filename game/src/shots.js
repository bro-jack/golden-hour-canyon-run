// Golden Hour Canyon Run — screenshot scenes behind ?shot=cover|ring|landing|win.
// Each one plays the real rules forward from a fresh world with the autopilot, so the frame is
// what a real sortie looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { stepPlane, freshPlane, FLIGHT } from './plane.js';
import { autopilotControl } from './autopilot.js';
import { RUNWAY } from './config.js';
import { canyonCenter } from './world.js';

const MAX_STEPS = 60 * 600; // 10 simulated minutes at most

function runUntil(game, cond) {
  let steps = 0;
  while (steps < MAX_STEPS) {
    const ctl = autopilotControl(game.plane, game.rings, game.heightAt);
    const ev = stepPlane(game.plane, ctl, game.rings, game.heightAt, STEP);
    steps += 1;
    if (cond(game.plane, ev)) return { steps, event: ev };
    if (game.plane.phase === FLIGHT.CRASHED || game.plane.phase === FLIGHT.LANDED) return { steps, event: ev };
  }
  return { steps, event: 'timeout' };
}

/**
 * Stage `game` (plane + rings + heightAt) to the named scene and return the screen to show.
 * The caller freezes the sim after this and renders the frozen frame.
 */
export function stageShot(name, game) {
  game.plane = freshPlane(game.mode);
  for (const r of game.rings) r.passed = false;
  // Skip the takeoff roll: start airborne, mid-canyon, so every shot is in the air.
  game.plane.phase = FLIGHT.FLYING;
  game.plane.y = 80;
  game.plane.speed = 120;
  game.plane.throttle = 0.6;
  game.plane.z = -60;
  game.plane.x = canyonCenter(-60);

  if (name === 'ring') {
    // Fly until the jet is about to cross ring 3 — the frame catches it inside the glow.
    const target = game.rings[2] || game.rings[game.rings.length - 1];
    runUntil(game, (p) => Math.abs(p.z - target.z) < 55 && Math.abs(p.x - target.x) < 40);
    return { screen: 'play', note: `ring ${target.index + 1}` };
  }
  if (name === 'landing') {
    // Fly the whole course, freeze on final approach to runway B.
    runUntil(game, (p) => p.ringsPassed >= game.rings.length && p.z - RUNWAY.b.z < 420 && p.z > RUNWAY.b.z);
    return { screen: 'play', note: 'final approach' };
  }
  if (name === 'win') {
    // Fly the whole sortie to touchdown.
    const res = runUntil(game, (p) => p.phase === FLIGHT.LANDED);
    return { screen: res.event === 'landed' || game.plane.phase === FLIGHT.LANDED ? 'win' : 'play', note: 'touchdown' };
  }
  // cover: mid-flight, next ring 120–200m ahead so the ring, the jet, the canyon
  // and the runway all read in one frame instead of the ring filling the screen.
  // Freeze while the jet is near-level, so the cover shows the aircraft, not a bank.
  runUntil(game, (p) => {
    const next = game.rings[p.ringsPassed];
    if (!next || p.ringsPassed < 2) return false;
    const d = Math.hypot(next.x - p.x, next.y - p.y, next.z - p.z);
    return d < 200 && d > 120 && Math.abs(p.bank) < 0.25;
  });
  return { screen: 'play', note: 'cover' };
}
