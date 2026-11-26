// Golden Hour Canyon Run — the glue: screens, loop, screenshots, playtest.
// Query params: ?seed=N (world seed), ?mode=run|time|precision, ?shot=cover|ring|landing|win
// (frozen staged frame), ?auto=1 (autopilot flies the whole sortie, reports the result).
import { STEP, MODES, WORLD } from './config.js';
import { freshPlane, stepPlane, landingScore, FLIGHT } from './plane.js';
import { createRender } from './render.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { autopilotControl } from './autopilot.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || WORLD.seedDefault) || WORLD.seedDefault;
const shotName = params.get('shot') || '';
const autoPlay = params.get('auto') === '1';
const canvas = document.getElementById('scene');
const hud = createHud();
const input = createInput(canvas);
const audio = createAudio();

let modeKey = params.get('mode') || 'run';
if (!MODES[modeKey]) modeKey = 'run';
let render = createRender(canvas, seed, modeKey);
let plane = freshPlane(MODES[modeKey]);
let screen = 'title'; // title | play | pause | win | crash
let frozen = false;
let autoDone = false;

function resize() {
  render.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// Mode picker on the title screen.
const modeRow = document.getElementById('mode-row');
function selectMode(key) {
  modeKey = key;
  document.querySelectorAll('#mode-row .mode').forEach((el) => {
    el.classList.toggle('sel', el.dataset.mode === key);
  });
  render = createRender(canvas, seed, modeKey);
  plane = freshPlane(MODES[modeKey]);
  audio.click();
}
modeRow.addEventListener('click', (e) => {
  const el = e.target.closest('.mode');
  if (el) selectMode(el.dataset.mode);
});

function startGame() {
  audio.ensure();
  audio.click();
  plane = freshPlane(MODES[modeKey]);
  // Rebuild rings for a fresh run.
  render = createRender(canvas, seed, modeKey);
  hud.showTitle(false);
  hud.showWin(false);
  hud.showCrash(false);
  hud.showPause(false);
  screen = 'play';
  hud.setStatus('Flying the canyon. Rings ahead.');
}
document.getElementById('btn-fly').addEventListener('click', startGame);
document.getElementById('btn-resume').addEventListener('click', () => {
  input.setPaused(false);
  hud.showPause(false);
  screen = 'play';
});
document.getElementById('btn-again').addEventListener('click', startGame);
document.getElementById('btn-retry').addEventListener('click', startGame);

function finishWin() {
  const mode = modeKey;
  const { lines, total } = landingScore(plane, mode);
  plane.score = total;
  screen = 'win';
  audio.win();
  const sub = mode === 'precision'
    ? `All ${plane.ringsPassed} rings, soft landing, ${Math.round(plane.fuel)}% fuel left.`
    : `All rings flown in ${Math.floor(plane.time / 60)}:${String(Math.floor(plane.time % 60)).padStart(2, '0')}, wheels on the desert runway.`;
  hud.showWin(true, lines, total, sub);
  hud.setStatus(`Landed. Score ${total}.`);
  if (autoPlay && !autoDone) {
    autoDone = true;
    document.title = `RESULT WIN score=${total} time=${plane.time.toFixed(1)} fuel=${plane.fuel.toFixed(0)} dmg=${plane.damage.toFixed(0)}`;
    console.log(`[PLAYTEST] WIN score=${total} time=${plane.time.toFixed(1)} fuel=${plane.fuel.toFixed(0)} damage=${plane.damage.toFixed(0)} rings=${plane.ringsPassed}`);
  }
}

function finishCrash(reason) {
  screen = 'crash';
  audio.crash();
  const title = plane.fuel <= 0 && reason === 'fuel' ? 'OUT OF FUEL' : 'SORTIE LOST';
  hud.showCrash(true, title, plane.phase === FLIGHT.CRASHED ? 'CRASHED' : 'DOWN', reason || plane.crashReason || 'The canyon keeps what it catches.');
  hud.setStatus(`Crashed. Rings ${plane.ringsPassed}/${render.rings.length}.`);
  if (autoPlay && !autoDone) {
    autoDone = true;
    document.title = `RESULT CRASH rings=${plane.ringsPassed} time=${plane.time.toFixed(1)} reason=${(plane.crashReason || reason || '').slice(0, 40)}`;
    console.log(`[PLAYTEST] CRASH rings=${plane.ringsPassed} time=${plane.time.toFixed(1)} reason=${plane.crashReason || reason}`);
  }
}

// Screenshot staging: freeze the staged frame and keep rendering it.
if (shotName) {
  const game = { plane, rings: render.rings, heightAt: render.heightAt, mode: MODES[modeKey] };
  const staged = stageShot(shotName, game);
  plane = game.plane;
  frozen = true;
  screen = 'play';
  hud.showTitle(false);
  if (staged.screen === 'win') {
    const { lines, total } = landingScore(plane, modeKey);
    plane.score = total;
    hud.showWin(true, lines, total, `All rings flown, wheels on the desert runway.`);
  }
  hud.update(plane, render.rings, MODES[modeKey].label);
  render.renderStill(plane);
  document.title = `SHOT ${shotName} ${staged.note}`;
  console.log(`[SHOT] ${shotName} ${staged.note} rings=${plane.ringsPassed} phase=${plane.phase}`);
}

// Autopilot playtest: start flying at once, autopilot in control.
if (autoPlay && !shotName) {
  startGame();
}

let last = performance.now();
let acc = 0;
let lastHud = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (frozen) {
    render.renderStill(plane);
    return;
  }
  // Title screen: idle orbit over the canyon so the backdrop is alive.
  if (screen === 'title') {
    const t = now / 1000;
    const idle = { ...plane, x: 0, y: 120 + Math.sin(t * 0.2) * 8, z: -1200 + Math.sin(t * 0.05) * 200, yaw: Math.sin(t * 0.05) * 0.3, pitch: 0, bank: Math.sin(t * 0.2) * 0.08, speed: 110, throttle: 0.6, ringsPassed: 0, phase: 'flying' };
    render.render(idle, dt);
    return;
  }
  if (input.wasPressed('Digit1')) selectMode('run');
  if (input.wasPressed('Digit2')) selectMode('time');
  if (input.wasPressed('Digit3')) selectMode('precision');
  if (input.isPaused() && screen === 'play') {
    screen = 'pause';
    hud.showPause(true);
  } else if (!input.isPaused() && screen === 'pause') {
    screen = 'play';
    hud.showPause(false);
  }
  if (screen !== 'play') {
    render.render(plane, dt);
    return;
  }
  acc += dt;
  let event = '';
  while (acc >= STEP) {
    const ctl = autoPlay ? autopilotControl(plane, render.rings, render.heightAt) : input.read();
    event = stepPlane(plane, ctl, render.rings, render.heightAt, STEP);
    acc -= STEP;
    if (event === 'ring') audio.ring();
    if (event === 'crash') break;
    if (event === 'landed') break;
    // Time Trial: the clock is the enemy.
    if (MODES[modeKey].timeLimit > 0 && plane.time > MODES[modeKey].timeLimit) {
      finishCrash('Time up — the trial window closed with rings still unflown.');
      return;
    }
    if (plane.fuel <= 0 && plane.phase === FLIGHT.OUT_OF_FUEL && plane.speed < 30 && plane.y < 20) {
      finishCrash('Out of fuel and out of sky.');
      return;
    }
  }
  if (event === 'landed') {
    finishWin();
    return;
  }
  if (event === 'crash') {
    finishCrash(plane.crashReason);
    return;
  }
  audio.setMuted(input.isMuted());
  audio.update(plane.throttle, plane.speed, screen === 'play');
  render.render(plane, dt);
  if (now - lastHud > 100) {
    lastHud = now;
    hud.update(plane, render.rings, MODES[modeKey].label);
  }
}
requestAnimationFrame(frame);
