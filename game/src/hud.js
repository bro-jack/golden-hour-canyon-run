// Golden Hour Canyon Run — the HUD: DOM panels, big numerals, one update per frame.
import { headingDeg } from './plane.js';

const $ = (id) => document.getElementById(id);

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const COMPASS_POINTS = ['N', '030', '060', 'E', '120', '150', 'S', '210', '240', 'W', '300', '330'];

export function createHud() {
  const els = {
    alt: $('hud-alt'),
    spd: $('hud-spd'),
    hdg: $('hud-hdg'),
    rings: $('hud-rings'),
    time: $('hud-time'),
    score: $('hud-score'),
    thrFill: $('throttle-fill'),
    thrPct: $('thr-pct'),
    fuelFill: $('fuel-fill'),
    fuelPct: $('fuel-pct'),
    dmgFill: $('damage-fill'),
    dmgPct: $('dmg-pct'),
    mode: $('hud-mode'),
    compass: $('compass-strip'),
    ringArrow: $('ring-arrow'),
    ringText: $('ring-text'),
    nextRing: $('next-ring'),
    message: $('message'),
    hint: $('hint'),
    status: $('status'),
    title: $('screen-title'),
    pause: $('screen-pause'),
    win: $('screen-win'),
    crash: $('screen-crash'),
    winLines: $('win-lines'),
    winSub: $('win-sub'),
    crashTitle: $('crash-title'),
    crashHead: $('crash-head'),
    crashSub: $('crash-sub'),
  };
  let lastMessageAt = -1;

  function show(el, on) {
    el.classList.toggle('hidden', !on);
  }

  return {
    update(p, rings, modeLabel) {
      // Altitude in feet (1 unit = 3 ft), speed in knots (1 unit = 1.6 kt).
      els.alt.textContent = Math.round(Math.max(0, p.y - 2.5) * 3);
      els.spd.textContent = Math.round(p.speed * 1.6);
      els.hdg.textContent = String(headingDeg(p)).padStart(3, '0');
      els.rings.textContent = `${p.ringsPassed}/${rings.length}`;
      els.time.textContent = fmtTime(p.time);
      els.score.textContent = String(p.score);
      els.thrFill.style.width = `${Math.round(p.throttle * 100)}%`;
      els.thrPct.textContent = `${Math.round(p.throttle * 100)}%`;
      els.fuelFill.style.width = `${Math.round(p.fuel)}%`;
      els.fuelPct.textContent = `${Math.round(p.fuel)}%`;
      els.fuelFill.style.background = p.fuel < 20
        ? 'linear-gradient(90deg,#ff3b30,#ff7a2e)'
        : 'linear-gradient(90deg,#37d67a,#a5e34d)';
      els.dmgFill.style.width = `${Math.round(p.damage)}%`;
      els.dmgPct.textContent = `${Math.round(p.damage)}%`;
      els.mode.textContent = modeLabel;
      // Compass strip centred on the current heading.
      const hdg = headingDeg(p);
      const idx = Math.round(hdg / 30) % 12;
      const strip = [0, 1, 2, 3, 4].map((k) => COMPASS_POINTS[(idx + k - 2 + 12) % 12]).join('  ·  ');
      els.compass.textContent = strip;
      // Next ring: arrow + distance. The arrow rotates with the bearing to the ring.
      const next = rings[p.ringsPassed];
      if (next) {
        const dx = next.x - p.x;
        const dz = next.z - p.z;
        const dist = Math.round(Math.sqrt(dx * dx + dz * dz + (next.y - p.y) * (next.y - p.y)));
        const bearing = Math.atan2(dx, -dz); // 0 = straight ahead
        let rel = bearing - p.yaw;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        const deg = Math.round((rel * 180) / Math.PI);
        els.ringArrow.style.display = '';
        els.ringArrow.style.transform = `rotate(${deg}deg)`;
        els.ringText.textContent = `NEXT RING ${dist}m ${deg === 0 ? '' : deg > 0 ? '↻' : '↺'}`;
      } else {
        els.ringArrow.style.display = '';
        els.ringArrow.style.transform = 'rotate(0deg)';
        els.ringText.textContent = 'ALL RINGS — LAND ON RUNWAY B';
      }
      // Transient centre message.
      if (p.message && p.messageAt !== lastMessageAt) {
        lastMessageAt = p.messageAt;
        els.message.textContent = p.message;
        els.message.style.opacity = '1';
        window.setTimeout(() => {
          els.message.style.opacity = '0';
        }, 2200);
      }
    },
    showTitle(on) { show(els.title, on); },
    showPause(on) { show(els.pause, on); },
    showWin(on, lines, total, sub) {
      show(els.win, on);
      // The "LAND ON RUNWAY B" banner contradicts the TOUCHDOWN panel while
      // the win screen is up (v4 fix) — hide it, and bring it back on restart.
      show(els.nextRing, !on);
      if (!on) return;
      els.winSub.textContent = sub;
      els.winLines.innerHTML = lines.map(([k, v, n]) => `${k} <b>${n >= 0 ? '+' : ''}${n}</b><br>`).join('')
        + `<span style="font-size:20px;font-weight:800">TOTAL <b>+${total}</b></span>`;
    },
    showCrash(on, title, head, sub) {
      show(els.crash, on);
      if (!on) return;
      els.crashTitle.textContent = title;
      els.crashHead.textContent = head;
      els.crashSub.textContent = sub;
    },
    setStatus(text) {
      els.status.textContent = text;
    },
  };
}
