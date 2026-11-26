# Golden Hour Canyon Run

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/bro-jack/golden-hour-canyon-run/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/bro-jack/golden-hour-canyon-run/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

A 3D flight game for make.fun `best-flight-game-20261126-0057`: take off from a desert strip,
thread 10 glowing rings down a golden-hour canyon, and land on the far runway. Three.js (vendored),
zero network, keyboard + mouse, WebAudio sound, seeded world.

## Play it

```sh
node serve.ts   # serves game/ on http://localhost:8080
```

Or open `game/index.html` from any static server. `?seed=N` rebuilds the same canyon,
`?mode=run|time|precision` picks the sortie, `?shot=cover|ring|landing|win` stages a
screenshot scene, `?auto=1` lets the autopilot fly the whole sortie.

## Controls

- **W/S** throttle · **A/D** bank · **↑/↓** pitch · **mouse** hold to steer · **Esc** pause · **M** mute
- **1/2/3** pick the sortie on the title screen: Canyon Run, Time Trial (2:30), Precision (8 small rings)

## Files

- `game/index.html` — canvas + glossy HUD
- `game/src/config.js` — all tunables · `random.js` — seeded RNG + noise
- `game/src/world.js` — canyon terrain, river, runways, rings, sky, jet
- `game/src/plane.js` — flight model (throttle, bank, pitch, fuel, damage)
- `game/src/render.js` — Three.js scene + chase camera
- `game/src/hud.js` — HUD panels · `input.js` — keyboard + mouse
- `game/src/audio.js` — WebAudio engine/wind/chimes · `autopilot.js` — shot + playtest pilot
- `game/src/shots.js` — deterministic screenshot scenes · `main.js` — game loop
- `main.ts` — hands the game in (copies game/ + screenshots/ to /output, writes dossier.json)

<sub>Entered on [make.fun](https://make.fun/?ref=7xkxffzs&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
