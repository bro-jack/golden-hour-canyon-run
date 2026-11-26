// Golden Hour Canyon Run — the autopilot: flies the real rules, used by screenshots and playtests.
// It steers toward the next ring, keeps a cruise speed, avoids rock, and lands on runway B.
import { PLANE, RUNWAY } from './config.js';
import { canyonCenter } from './world.js';

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Control vector { bank, pitch, throttleSet } for one step. */
export function autopilotControl(p, rings, heightAt) {
  const next = rings[p.ringsPassed];
  let targetX;
  let targetY;
  let targetZ;
  let targetSpeed = PLANE.cruiseSpeed;

  if (next) {
    targetX = next.x;
    targetY = next.y;
    targetZ = next.z;
  } else {
    // All rings done: line up on runway B, descend on a glide slope to the threshold.
    const bx = canyonCenter(RUNWAY.b.z);
    const dz = p.z - RUNWAY.b.z;
    if (dz < -180 && p.y > 15) {
      // Overshot the strip and still airborne: go around — climb high, fly back up
      // the canyon, re-approach.
      targetX = canyonCenter(-2400);
      targetY = 170;
      targetZ = -2400;
      targetSpeed = 120;
    } else {
      // Glide slope: 9 units down per 100 along, 2 at the threshold — the aim point sits
      // BELOW the touchdown height on purpose, so the jet flies through the landing
      // check instead of levelling off above the strip forever.
      // The aim point stays ahead of the jet — a target behind it would make it turn
      // around on the strip.
      targetX = bx;
      targetY = 2 + Math.max(0, dz) * 0.09;
      targetZ = Math.min(RUNWAY.b.z - 40, p.z - 150);
      targetSpeed = dz > 300 ? 95 : 82;
    }
  }

  // Terrain probe ahead: if the rock ahead is higher than us, climb now.
  // Look far ahead: at 200 u/s a 120-unit probe is under a second of flight.
  const aheadX = p.x + Math.sin(p.yaw) * 260;
  const aheadZ = p.z - Math.cos(p.yaw) * 260;
  const aheadGround = heightAt(aheadX, aheadZ);
  // A wall counts only when the ground ahead RISES well above the ground under us
  // and reaches near our altitude. Comparing against the jet's altitude alone
  // false-triggers on flat ground during the landing flare (y=5 over ground 2).
  const localGround = heightAt(p.x, p.z);
  const mustClimb = aheadGround - localGround > 8 && aheadGround > p.y - 6;

  // Desired heading toward the target.
  // NOTE: bank > 0 turns LEFT (yaw decreases), so steering right needs negative bank.
  const dx = targetX - p.x;
  const dz = targetZ - p.z;
  const wantYaw = Math.atan2(dx, -dz);
  let yawErr = wantYaw - p.yaw;
  while (yawErr > Math.PI) yawErr -= Math.PI * 2;
  while (yawErr < -Math.PI) yawErr += Math.PI * 2;

  // Recovery: the next ring is behind us, or nearly so. Climb above the mesas FIRST,
  // then turn — a low turn-back flies straight into the canyon wall. Slow down for
  // the turn: at 190 u/s the turning circle is wider than the canyon.
  const behind = next && (next.z > p.z + 20 || Math.abs(yawErr) > 1.5);
  if (behind && p.y < 165) {
    return {
      bank: clamp(-yawErr * 0.6, -0.6, 0.6),
      pitch: 0.8,
      throttleSet: 0.35,
    };
  }

  let bank = clamp(-yawErr * 1.6, -1, 1);
  // Stay in the canyon: near a wall, steer back to the centreline hard.
  const offCentre = p.x - canyonCenter(p.z);
  if (Math.abs(offCentre) > 95) bank = clamp(bank + Math.sign(offCentre) * 0.7, -1, 1);

  // Desired pitch toward the target altitude, or up over rock.
  let pitch;
  if (mustClimb) {
    // A wall dead ahead cannot be out-climbed — its slope is steeper than the jet's
    // climb. Turn back to the centreline AND climb.
    pitch = 0.7;
    bank = clamp(bank + Math.sign(p.x - canyonCenter(p.z)) * 0.8, -1, 1);
  } else {
    const altErr = targetY - p.y;
    pitch = clamp(altErr * 0.02, -0.8, 0.9);
    // On final, track the glide slope tightly — a lazy 0.02 gain leaves the jet
    // floating 20 units above the strip until the runway runs out.
    if (!next && p.z - RUNWAY.b.z < 500) pitch = clamp(altErr * 0.08, -0.9, 0.3);
  }

  // Throttle: hold the target speed. (No cut to idle on final: at 60 u/s the descent
  // rate is too weak to stay on the glide slope — the jet floats past the strip.)
  const throttleSet = clamp(0.45 + (targetSpeed - p.speed) * 0.012, 0.15, 0.95);

  return { bank, pitch, throttleSet };
}
