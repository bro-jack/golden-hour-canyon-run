// Golden Hour Canyon Run — the world: canyon terrain, river, runways, rings, sky, jet.
// Everything is built from the seed, so ?seed= rebuilds the same canyon every time.
import * as THREE from 'three';
import { makeFbm, mulberry32 } from './random.js';
import { WORLD, RINGS, RUNWAY } from './config.js';

const SIZE = 4600; // terrain spans x -2300..2300, z -3400..1200
const SEG = 200;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function smooth(a, b, t) {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

/** Canyon centreline meanders gently down the course. */
export function canyonCenter(z) {
  return 60 * Math.sin(z * 0.0009) + 25 * Math.sin(z * 0.0023 + 1.7);
}

export function makeHeightAt(seed) {
  const fbm = makeFbm(seed);
  const fbm2 = makeFbm(seed + 101);
  return function heightAt(x, z) {
    const d = Math.abs(x - canyonCenter(z));
    const wall = smooth(WORLD.canyonHalfWidth, 430, d);
    // Mesa tops: quantised strata steps so the walls read as layered rock.
    const mesa = fbm(x * 0.0016, z * 0.0016) * 0.5 + 0.5;
    const strata = Math.floor(mesa * 5) / 5;
    const top = WORLD.wallHeight * (0.55 + 0.6 * strata) + fbm2(x * 0.004, z * 0.004) * 14;
    const floor = fbm(x * 0.01, z * 0.01) * 3.5 + fbm(x * 0.05, z * 0.05) * 0.8;
    // Runway pads are flat: blend to runway height near each strip — fully flat
    // along the whole strip, blending out only past its ends.
    let h = floor + wall * (top - floor);
    for (const r of [RUNWAY.a, RUNWAY.b]) {
      const dz = Math.abs(z - r.z);
      const dx = Math.abs(x - canyonCenter(r.z));
      const near = (1 - smooth(r.length / 2, r.length / 2 + 60, dz)) * (1 - smooth(r.width / 2, r.width / 2 + 80, dx));
      h = h * (1 - near) + 2.5 * near;
    }
    return h;
  };
}

/** Ring course: meandering down the canyon, varied altitude and lateral offset. */
export function makeRings(seed, count, radius) {
  const rand = mulberry32(seed ^ 0x51ab);
  const phase = rand() * Math.PI * 2;
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const z = RINGS.firstZ + (RINGS.lastZ - RINGS.firstZ) * t;
    // Smooth meander, not a random zigzag: consecutive rings shift by at most ~40 units,
    // so the jet can follow the course instead of S-turning into the walls.
    const x = canyonCenter(z) + 55 * Math.sin(z * 0.0035 + phase);
    // Altitude follows a hump: low after takeoff, high mid-canyon, low again for the
    // final rings — a real approach into runway B, not a dive from 140 units up.
    const y = RINGS.minAlt + Math.sin(t * Math.PI) * (RINGS.maxAlt - RINGS.minAlt) + rand() * 10;
    rings.push({ x, y, z, radius, passed: false, index: i });
  }
  return rings;
}

function terrainColor(h, slope, nBroad, nPatch, nFine, out) {
  // Layered desert strata: sand floor, red rock walls, pale caps, dark shadow bands.
  // Rule 8 — grain/mottling (v6): the old floor was ONE flat tan value with only a
  // ±6% global jitter, so the canyon floor read as a giant flat pastel sheet.
  // Now three noise scales shape the colour: broad (strata wobble), patch
  // (~30-unit blotches: dark/pale sand patches on the floor, tone shifts inside
  // each wall band) and fine (per-vertex grain). Slope still darkens steep faces.
  const sand = [0.78, 0.58, 0.36];
  const sandDark = [0.63, 0.43, 0.25];
  const sandPale = [0.87, 0.70, 0.48];
  const rock = [0.62, 0.32, 0.2];
  const rockDark = [0.42, 0.2, 0.13];
  const rockMid = [0.55, 0.26, 0.17];
  const pale = [0.85, 0.68, 0.48];
  const scrub = [0.30, 0.42, 0.16];
  const patchT = nPatch * 0.5 + 0.5; // 0..1
  let c;
  if (h < 6) {
    // Floor: patchy sand — dark and pale blotches break the flat tan sheet.
    if (patchT < 0.35) c = sandDark;
    else if (patchT > 0.72) c = sandPale;
    else c = sand;
  } else if (h < 110) {
    // Strata bands wobble with the noise field and vary in thickness, so the walls
    // read as eroded rock layers instead of stacked cards: no band edge is level,
    // and four tones cycle instead of a strict two-tone alternation.
    const bandH = 11 + nBroad * 5;
    const band = Math.floor((h + nBroad * 20) / bandH);
    const palette = [rock, rockDark, rockMid, rockDark];
    c = palette[((band % 4) + 4) % 4];
  } else c = pale;
  // Steep faces pull toward dark rock (scree/shadow in the crevices).
  const steep = smooth(0.45, 1.1, slope);
  const shade = 0.66 + 0.34 * clamp(1 - slope * 2.2, 0, 1);
  // Mid-scale patch brightness + fine per-vertex grain: together they break the
  // flat pastel look at screenshot distance AND up close.
  const patch = 0.84 + 0.32 * patchT;
  const grain = 0.90 + 0.20 * (nFine * 0.5 + 0.5);
  const jitter = shade * patch * grain;
  out[0] = (c[0] * (1 - steep * 0.35) + rockDark[0] * steep * 0.35) * jitter;
  out[1] = (c[1] * (1 - steep * 0.35) + rockDark[1] * steep * 0.35) * jitter;
  out[2] = (c[2] * (1 - steep * 0.35) + rockDark[2] * steep * 0.35) * jitter;
  // Scrub patches near the river: irregular dark-green blotches from the
  // mid-scale field, so the damp floor reads as patchy scrub, not paint.
  if (h < 7 && nPatch > 0.45) {
    out[0] = scrub[0] * jitter;
    out[1] = scrub[1] * jitter;
    out[2] = scrub[2] * jitter;
  }
  return out;
}

export function buildTerrain(scene, heightAt, seed) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const fbm = makeFbm(seed + 7);
  const fbmPatch = makeFbm(seed + 8);
  const c = [0, 0, 0];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 1100; // shift so the course z=0..-2900 sits inside
    const h = heightAt(x, z);
    pos.setY(i, h);
    pos.setZ(i, z);
    const hx = heightAt(x + 6, z) - heightAt(x - 6, z);
    const hz = heightAt(x, z + 6) - heightAt(x, z - 6);
    const slope = Math.sqrt(hx * hx + hz * hz) / 12;
    // Three noise scales for the colour: broad strata wobble (~100 u),
    // patch blotches (~30 u) and fine per-vertex grain (~11 u).
    terrainColor(h, slope, fbm(x * 0.01, z * 0.01), fbmPatch(x * 0.035, z * 0.035), fbm(x * 0.09, z * 0.09), c);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** Floor detail: boulders at the wall feet, shrubs near the river, cacti on the flats. */
export function buildScatter(scene, heightAt, seed) {
  const rand = mulberry32(seed ^ 0x5ca7);
  const dummy = new THREE.Object3D();
  function place(mesh, count, pick) {
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 30) {
      tries += 1;
      const p = pick(rand);
      if (!p) continue;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(p.s, p.sy || p.s, p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed += 1;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
    return placed;
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6e4530, roughness: 0.95, metalness: 0 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 130);
  const nRocks = place(rocks, 130, (r) => {
    const z = 300 - r() * 3600;
    const d = 150 + r() * 280;
    const x = canyonCenter(z) + (r() < 0.5 ? -1 : 1) * d;
    const h = heightAt(x, z);
    if (h < 4) return null; // keep the river and the strips clear
    const s = 1.5 + r() * 4.5;
    return { x, y: h + s * 0.25, z, s };
  });
  // Shrubs: CONNECTED THICKETS, not scattered cubes (rule 8, v6). The old 90
  // lone shrubs read as green dice sprinkled on the floor. Each thicket is a
  // ragged noise-edged mass — dense dark core, thinning pale rim — so the
  // vegetation reads as a living mass that CONTRASTS with the tan slope
  // behind it. Per-instance colours darken toward the core; overlapping
  // squashed icosahedra merge into one canopy mass instead of separate cubes.
  // v6b: the first attempt placed only 14 shrubs in 2 clusters — the centre
  // height window (h 2..10) rejected most random centres and nothing retried,
  // so no thicket ever showed in the staged shots. Now centres retry until
  // placed, and 3 "hero" thickets are planted beside the course at z -700 /
  // -1200 / -1700, where the cover and ring cameras look, with bigger shrubs
  // so the mass reads at 200–400 units.
  const fbmC = makeFbm(seed + 55);
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), shrubMat, 240);
  const coreGreen = new THREE.Color(0x2c4218);
  const rimGreen = new THREE.Color(0x5a6b2a);
  const spotColor = new THREE.Color();
  let nShrubs = 0;
  function placeThicket(cx, cz, R, target, sizeBoost) {
    let placed = 0;
    let tries = 0;
    while (placed < target && tries < target * 10 && nShrubs < 240) {
      tries += 1;
      const a = rand() * Math.PI * 2;
      const t = Math.sqrt(rand()); // uniform in disc; 0 = core, 1 = rim
      // Ragged edge: the outline wobbles with noise instead of a clean disc.
      const wobble = 0.65 + 0.7 * (fbmC(cx * 0.05 + Math.cos(a) * 2.5, cz * 0.05 + Math.sin(a) * 2.5) * 0.5 + 0.5);
      const rr = R * t * wobble;
      if (rand() > 1.2 - t) continue; // thin the rim: core dense, edge sparse
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const h = heightAt(x, z);
      if (h < 1.5 || h > 11) continue;
      const core = 1 - t;
      const s = (core > 0.55 ? 1.6 + rand() * 1.8 : 0.7 + rand() * 1.1) * sizeBoost;
      dummy.position.set(x, h + s * 0.25, z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(s, s * 0.55, s);
      dummy.updateMatrix();
      shrubs.setMatrixAt(nShrubs, dummy.matrix);
      spotColor.copy(coreGreen).lerp(rimGreen, 1 - core);
      spotColor.offsetHSL(0, 0, (rand() - 0.5) * 0.06);
      shrubs.setColorAt(nShrubs, spotColor);
      nShrubs += 1;
      placed += 1;
    }
    return placed;
  }
  // Hero thickets beside the course, where the cover/ring cameras look.
  for (const [hz, side] of [[-700, -1], [-1200, 1], [-1700, -1]]) {
    for (let d = 140; d <= 280; d += 10) {
      const hx = canyonCenter(hz) + side * d;
      const hh = heightAt(hx, hz);
      if (hh >= 2.5 && hh <= 9) {
        placeThicket(hx, hz, 13 + rand() * 7, 12, 1.35);
        break;
      }
    }
  }
  // Random thickets along the damp floor near the river, retried until placed.
  let clustersPlaced = 0;
  let centerTries = 0;
  while (clustersPlaced < 12 && centerTries < 200 && nShrubs < 240) {
    centerTries += 1;
    const cz = 200 - rand() * 3300;
    const cd = 130 + rand() * 270;
    const cx = canyonCenter(cz) + (rand() < 0.5 ? -1 : 1) * cd;
    const ch = heightAt(cx, cz);
    if (ch < 2 || ch > 10) continue; // thickets hug the damp floor near the river
    clustersPlaced += 1;
    placeThicket(cx, cz, 10 + rand() * 16, 7 + Math.floor(rand() * 9), 1);
  }
  shrubs.count = nShrubs;
  shrubs.instanceMatrix.needsUpdate = true;
  if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
  shrubs.castShadow = true;
  scene.add(shrubs);
  // Cacti: straight-sided dark green columns — the old tapered bright-green
  // cylinders read as traffic cones in the landing shot (v4 fix).
  const cactusMat = new THREE.MeshStandardMaterial({ color: 0x3a5f2e, roughness: 0.9, metalness: 0 });
  const cacti = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 7), cactusMat, 36);
  const nCacti = place(cacti, 36, (r) => {
    const z = 200 - r() * 3300;
    const d = 150 + r() * 230;
    const x = canyonCenter(z) + (r() < 0.5 ? -1 : 1) * d;
    const h = heightAt(x, z);
    if (h < 2 || h > 12) return null;
    const s = 2.5 + r() * 3.5;
    return { x, y: h + s * 0.5, z, s, sy: s };
  });
  // Wall-face boulders (v5): big rocks embedded in the steep wall faces, not
  // just at the wall feet — they break up the smooth sun-lit wall that reads
  // as one flat orange expanse in the cover/landing shots.
  const wallRocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 90);
  const nWallRocks = place(wallRocks, 90, (r) => {
    const z = 300 - r() * 3600;
    const d = 55 + r() * 150;
    const x = canyonCenter(z) + (r() < 0.5 ? -1 : 1) * d;
    const h = heightAt(x, z);
    if (h < 12 || h > 70) return null; // on the wall face, not the floor
    const s = 2.5 + r() * 4.5;
    return { x, y: h + s * 0.1, z, s, sy: s * 0.7 };
  });
  // Pebbles: micro-variation close to the flight path (v3 polish) — small stones
  // scattered on the canyon floor near the centreline, where the chase camera looks.
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x7a5a40, roughness: 1, metalness: 0 });
  const pebbles = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), pebbleMat, 220);
  const nPebbles = place(pebbles, 220, (r) => {
    const z = 300 - r() * 3600;
    const d = 30 + r() * 110;
    const x = canyonCenter(z) + (r() < 0.5 ? -1 : 1) * d;
    const h = heightAt(x, z);
    if (h < 1 || h > 8) return null; // floor only, clear of the river and strips
    const s = 0.4 + r() * 0.9;
    return { x, y: h + s * 0.2, z, s, sy: s * 0.6 };
  });
  return { rocks: nRocks, shrubs: nShrubs, cacti: nCacti, pebbles: nPebbles, wallRocks: nWallRocks };
}

export function buildRiver(scene) {
  // A wide, winding river that reads as a RIVER at a glance (v7): the old
  // ribbon was 14 units wide, nearly straight (±18 meander), and its pale
  // bank was buried under the floor (top 0.26 vs floor ±4) — from the chase
  // camera it read as a dark blue line / road, and the user asked "what is
  // that blue thing". Now: 24 units of bright blue-grey water, a real
  // S-meander, pale sand banks that sit PROUD of the floor, and a low-metal
  // glossy water material so the low sun puts a glint on it instead of the
  // metal going black with no env map.
  function riverX(z) {
    const base = canyonCenter(z) + 42 * Math.sin(z * 0.004) + 20 * Math.sin(z * 0.0095 + 1.3);
    // Bend around the runway strips so the water never crosses a strip:
    // +25 near z=0 and z=-2900, fading over ~200 units.
    const dA = Math.exp(-((z / 200) ** 2));
    const dB = Math.exp(-(((z + 2900) / 220) ** 2));
    return base + 25 * (dA + dB);
  }
  const pts = [];
  for (let z = 80; z >= -3200; z -= 60) pts.push(new THREE.Vector3(riverX(z), WORLD.riverY, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  // Pale sandy banks, 38 units wide, top above the floor bumps, so a pale
  // rim shows on both sides of the water along the whole course.
  const bankGeo = new THREE.TubeGeometry(curve, 120, 19, 6, false);
  bankGeo.scale(1, 0.06, 1);
  const bank = new THREE.Mesh(bankGeo, new THREE.MeshStandardMaterial({ color: 0xd8c49a, roughness: 1, metalness: 0 }));
  bank.position.y = 0.4;
  scene.add(bank);
  const geo = new THREE.TubeGeometry(curve, 120, 12, 6, false);
  geo.scale(1, 0.22, 1);
  // Water is bright blue-grey and glossy with LOW metal — high metalness with
  // no env map goes black in shadow (the v5 intake lesson). Low roughness lets
  // the low sun throw a bright glint along the channel; a sky-tint emissive
  // keeps it from ever reading as a black crack.
  const mat = new THREE.MeshStandardMaterial({ color: 0x74b4d8, roughness: 0.1, metalness: 0.2, emissive: 0x2a4258, emissiveIntensity: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.8;
  scene.add(mesh);
  return mesh;
}

function runwayGroup(z, width, length, label) {
  const g = new THREE.Group();
  const cx = canyonCenter(z);
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.6, length),
    new THREE.MeshStandardMaterial({ color: 0x3d3630, roughness: 0.9 }),
  );
  strip.position.set(cx, 2.6, z);
  strip.receiveShadow = true;
  g.add(strip);
  // Apron pad by the hangar (v4): a warm dark taxi slab so the strip's
  // surroundings are not bare flat sand in the landing shot.
  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(46, 0.4, 70),
    new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95 }),
  );
  apron.position.set(cx - width / 2 - 26, 2.5, z + length / 4);
  apron.receiveShadow = true;
  g.add(apron);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5e9c8 });
  for (let dz = -length / 2 + 18; dz < length / 2 - 10; dz += 36) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.2, 14), lineMat);
    dash.position.set(cx, 3.0, z + dz);
    g.add(dash);
  }
  // Edge lights: warm dots down both sides.
  const lightGeo = new THREE.SphereGeometry(0.9, 6, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  for (let dz = -length / 2; dz <= length / 2; dz += 30) {
    for (const side of [-1, 1]) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(cx + side * (width / 2 + 3), 3.4, z + dz);
      g.add(l);
    }
  }
  // Windsock on a pole.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 16, 6), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
  pole.position.set(cx + width / 2 + 12, 10, z - length / 2 + 12);
  g.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 8), new THREE.MeshStandardMaterial({ color: 0xff7a2e, emissive: 0x903a00, emissiveIntensity: 0.4 }));
  sock.rotation.z = Math.PI / 2;
  sock.position.set(cx + width / 2 + 15, 17, z - length / 2 + 12);
  g.add(sock);
  // Hangar + tower give the strip a lived-in silhouette.
  const hangar = new THREE.Mesh(
    new THREE.CylinderGeometry(11, 11, 26, 12, 1, false, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x8a7a5e, roughness: 0.8, metalness: 0.25 }),
  );
  hangar.rotation.z = Math.PI / 2;
  hangar.rotation.y = Math.PI / 2;
  hangar.position.set(cx - width / 2 - 26, 3, z + length / 4);
  hangar.castShadow = true;
  g.add(hangar);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 22, 7), new THREE.MeshStandardMaterial({ color: 0xb8a888, roughness: 0.85 }));
  tower.position.set(cx + width / 2 + 22, 13, z + length / 3);
  tower.castShadow = true;
  g.add(tower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 9), new THREE.MeshStandardMaterial({ color: 0x2c4a63, roughness: 0.25, metalness: 0.6 }));
  cab.position.set(cx + width / 2 + 22, 26, z + length / 3);
  g.add(cab);
  g.userData.label = label;
  return g;
}

export function buildRunways(scene) {
  const a = runwayGroup(RUNWAY.a.z, RUNWAY.a.width, RUNWAY.a.length, 'A');
  const b = runwayGroup(RUNWAY.b.z, RUNWAY.b.width, RUNWAY.b.length, 'B');
  scene.add(a);
  scene.add(b);
  return { a, b };
}

export function buildRings(scene, rings) {
  const group = new THREE.Group();
  const meshes = [];
  for (const ring of rings) {
    const geo = new THREE.TorusGeometry(ring.radius, 1.6, 10, 40);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff8c1a, emissive: 0xff6a00, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    mesh.userData.ring = ring;
    group.add(mesh);
    // Inner glow disc so the ring reads even at thumbnail size.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(ring.radius * 0.92, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.1, side: THREE.DoubleSide }),
    );
    disc.position.copy(mesh.position);
    group.add(disc);
    meshes.push(mesh);
  }
  scene.add(group);
  return meshes;
}

export function buildSky(scene, seed) {
  const rand = mulberry32(seed ^ 0x77aa);
  // Low golden sun: a bright disc + a soft halo sprite made from a canvas gradient.
  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = 256;
  sunCanvas.height = 256;
  const ctx = sunCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,240,200,1)');
  grad.addColorStop(0.25, 'rgba(255,190,90,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(sunCanvas);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sun.position.set(-900, 260, -2600);
  sun.scale.set(700, 700, 1);
  scene.add(sun);
  // Wide faint halo behind the sun disc (v3 polish): a second, much larger and
  // dimmer copy of the same gradient, so the horizon glow feels deep, not a hard disc.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.45 }));
  halo.position.set(-900, 260, -2600);
  halo.scale.set(1800, 1800, 1);
  scene.add(halo);
  // Clouds: flattened clusters of warm-lit spheres drifting high over the mesas.
  // Two tones per cloud — sunlit tops and mauve shaded bellies — so they read as
  // volume instead of flat beige blobs. v4: the old puffs were too small and too
  // close in tone, so at screenshot distance they collapsed into flat tan pills —
  // bigger puffs, stronger lit/shade contrast, and two high clouds that fill the
  // empty top-centre sky.
  const clouds = new THREE.Group();
  const puffLit = new THREE.MeshLambertMaterial({ color: 0xffecc8, emissive: 0x9a6a38, emissiveIntensity: 0.35, transparent: true, opacity: 0.92 });
  const puffShade = new THREE.MeshLambertMaterial({ color: 0xa87f66, emissive: 0x4a3020, emissiveIntensity: 0.2, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 14; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 5 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p += 1) {
      const s = 22 + rand() * 30;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), p === 0 ? puffLit : (rand() < 0.5 ? puffLit : puffShade));
      puff.position.set((rand() - 0.5) * 110, (rand() - 0.5) * 14, (rand() - 0.5) * 50);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set((rand() - 0.5) * 3600, 260 + rand() * 160, 600 - rand() * 3400);
    clouds.add(cloud);
  }
  // Two high clouds over the course itself, so the top of the frame is never
  // an empty flat gradient in the cover shot. v4b: the first attempt put them
  // at y 430–470 — above the chase camera's frustum, so the cover's top stayed
  // empty. v4c: the second attempt put them far off-centre (x ±300–350) — they
  // sat at the frame's extreme edges. These two sit ON the course centreline
  // ahead of the jet, so they land in the frame's upper centre: one for the
  // cover (mid-canyon) and one for the landing shot (past runway B).
  for (const [cx, cy, cz] of [[-80, 320, -1400], [-100, 300, -3300]]) {
    const cloud = new THREE.Group();
    for (let p = 0; p < 6; p += 1) {
      const s = 26 + rand() * 30;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), p % 2 ? puffShade : puffLit);
      puff.position.set((rand() - 0.5) * 130, (rand() - 0.5) * 16, (rand() - 0.5) * 50);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(cx, cy, cz);
    clouds.add(cloud);
  }
  scene.add(clouds);
  return { sun, clouds };
}

/** Birds: small dark V shapes that flap over the canyon. */
export function buildBirds(scene, seed) {
  const rand = mulberry32(seed ^ 0xbeef);
  const birds = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x241a12, side: THREE.DoubleSide });
  const list = [];
  for (let i = 0; i < 12; i += 1) {
    const bird = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(3.4, 1.1);
    const left = new THREE.Mesh(wingGeo, mat);
    left.position.x = -1.7;
    const right = new THREE.Mesh(wingGeo, mat);
    right.position.x = 1.7;
    bird.add(left);
    bird.add(right);
    bird.position.set((rand() - 0.5) * 500, 90 + rand() * 90, -200 - rand() * 2200);
    bird.userData = { left, right, phase: rand() * Math.PI * 2, speed: 0.5 + rand() * 0.4 };
    birds.add(bird);
    list.push(bird);
  }
  scene.add(birds);
  return list;
}

/** The jet, built from primitives: smooth lathe fuselage (v10 — the faceted
 *  stealth body read as a grey slab), twin recessed nozzles, swept delta
 *  wings with rounded bevels, tailplanes, canted twin tails, bubble canopy. */
export function buildJet() {
  const jet = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b98a6, roughness: 0.42, metalness: 0.25 });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x7e8b9a, roughness: 0.48, metalness: 0.22 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3d4654, roughness: 0.5, metalness: 0.6 });
  // v5 lesson: intakes/spine were near-black 0x232830 and read as black holes
  // on the fuselage sides in the top-down landing shot. Intakes keep their own
  // low-metal material with a faint emissive so they read as dark gunmetal,
  // never as voids (metalness 0.6 with no env map goes black in shadow).
  const intakeMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.6, metalness: 0.15, emissive: 0x14181f, emissiveIntensity: 0.5 });
  // v8 lesson: the canopy read as a big pale egg from behind-top — too wide,
  // too tall, too bright. A fighter canopy is long and LOW: flatter, narrower,
  // longer, sunk into the fuselage, deeper blue tint so it reads as tinted
  // glass, not a white egg.
  // v10: canopy glass darker — tinted fighter glass, not pale blue.
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x2c4a63, roughness: 0.06, metalness: 0.45, transparent: true, opacity: 0.95, emissive: 0x0e2233, emissiveIntensity: 0.3 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
  // v10: finMat had emissive 0.9 — the fins glowed pale white from the chase
  // camera ("white sticks"). No emissive now; gunmetal like the body.
  const finMat = new THREE.MeshStandardMaterial({ color: 0x7e8b9a, roughness: 0.5, metalness: 0.2 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x7d8b9a, roughness: 0.5, metalness: 0.35 });

  // --- Fuselage, v10 rebuild: the v9 faceted diamond + wide flat aft deck
  // read as a grey SLAB from the chase camera ("ngbug"). A real fighter body
  // is a smooth curved tube: one LatheGeometry profile (nose tip → tail),
  // 28 segments + smooth shading, so the sun rolls across curved metal
  // instead of flat facets. Nose -z, tail +z, scale 1.35 later.
  const profile = [
    [0.60, 0.0], [0.68, 0.8], [0.80, 2.0], [0.92, 3.5], [0.95, 5.0],
    [0.88, 6.5], [0.75, 8.0], [0.58, 9.5], [0.38, 10.8], [0.18, 11.8],
    [0.05, 12.4], [0.0, 12.6],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyGeo = new THREE.LatheGeometry(profile, 28);
  bodyGeo.rotateX(-Math.PI / 2); // lathe +y (nose) maps to -z (forward)
  const fuselage = new THREE.Mesh(bodyGeo, bodyMat);
  fuselage.scale.set(1.02, 0.78, 1); // slightly flattened, chined look
  fuselage.position.z = 5.6; // nose tip at -7.0, tail at +5.6
  jet.add(fuselage);
  // Dark tail plate: the lathe tail is an open ring; without this the gap
  // between the nozzles shows a hole into the body.
  const tailPlate = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), darkMat);
  tailPlate.scale.set(1.02, 0.78, 1);
  tailPlate.position.set(0, 0, 5.58);
  jet.add(tailPlate);
  // Pitot tube on the nose tip.
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), darkMat);
  pitot.rotation.x = -Math.PI / 2;
  pitot.position.set(0, 0.05, -7.5);
  jet.add(pitot);
  // v10b: the first v10 mouth still read as two big brown "eyes" — the
  // burner light lit the tube interior orange-brown, and the white tail
  // light between them completed a "face". Fix: dark disc moved to 0.2
  // inside the mouth (was 0.7 deep, so the lit interior showed), mouth
  // shrunk 0.34 → 0.30, so the mouth reads as a dark ring around a small
  // flame, not a big lit disc.
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.44, 1.6, 16, 1, true), nozzleMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.68, 0.05, 5.4); // mouth at +6.2
    jet.add(nozzle);
    const throat = new THREE.Mesh(new THREE.CircleGeometry(0.27, 16), new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.9, metalness: 0 }));
    throat.position.set(side * 0.68, 0.05, 6.0);
    jet.add(throat);
  }
  // Long low bubble canopy sunk into the flat crown: peak only ~0.18 above
  // the deck, a glass strip on the spine, not a bulging egg.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), glassMat);
  canopy.scale.set(0.6, 0.34, 2.2);
  canopy.position.set(0, 0.50, -1.4); // v10: lathe crown is higher than the old faceted flat top
  jet.add(canopy);
  // Dark canopy frame: a thin rim under the glass so the canopy pops against
  // the fuselage instead of blending into it.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 2.8), darkMat);
  frame.position.set(0, 0.58, -1.4);
  jet.add(frame);
  // Main wings: swept delta planform, extruded with a soft bevel so the
  // edges read as built structure, not flat slabs. Each side is a group so
  // a slight anhedral (tips down) reads in the rear view.
  // v7 helper: shape coords x = spanwise, y = chordwise (+ = forward);
  // after rotateX(-90°), shape +y (forward) maps to -z and the extrusion
  // becomes the panel thickness. Points are listed CCW so the extrusion
  // faces outward on both sides.
  function trapezoidWing(side, x0, x1, leadRoot, leadTip, trailTip, trailRoot, depth) {
    const s = new THREE.Shape();
    if (side > 0) {
      s.moveTo(x0, trailRoot); s.lineTo(x1, trailTip); s.lineTo(x1, leadTip); s.lineTo(x0, leadRoot);
    } else {
      s.moveTo(-x0, leadRoot); s.lineTo(-x1, leadTip); s.lineTo(-x1, trailTip); s.lineTo(-x0, trailRoot);
    }
    s.closePath();
    // v10: generous bevel so wing/stab edges are rounded airfoil, not sharp slabs.
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.13, bevelSize: 0.15, bevelSegments: 3 });
    g.rotateX(-Math.PI / 2);
    return g;
  }
  for (const side of [-1, 1]) {
    const wingGroup = new THREE.Group();
    wingGroup.rotation.z = -side * 0.05; // slight anhedral
    const wing = new THREE.Mesh(trapezoidWing(side, 0.5, 5.9, 1.9, 0.2, -1.3, -1.6, 0.14), wingMat);
    wing.position.set(0, -0.15, 1.0);
    wingGroup.add(wing);
    // Darker inset panel on the wing top, so the wing reads as built
    // structure from above (v5 lesson).
    const panel = new THREE.Mesh(trapezoidWing(side, 0.9, 5.1, 1.45, 0.1, -1.0, -1.2, 0.05), panelMat);
    panel.position.set(0, 0.06, 1.0);
    wingGroup.add(panel);
    // Orange leading-edge stripe along the swept leading edge (root leading
    // z=-0.9, tip leading z=+0.8: length 5.66, swept 0.305 rad). Half the
    // stripe's depth sticks out ahead of the edge, so it reads as a band.
    const edge = new THREE.Mesh(new THREE.BoxGeometry(5.66, 0.14, 0.35), accentMat);
    edge.rotation.y = -side * Math.atan2(1.7, 5.4);
    edge.position.set(side * 3.2, 0.02, -0.05);
    wingGroup.add(edge);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 1.4), accentMat);
    tip.rotation.y = -side * Math.atan2(1.7, 5.4);
    tip.position.set(side * 5.75, 0.02, 1.55);
    wingGroup.add(tip);
    // Underwing pylon: a small dark store rail, visible in banking shots.
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 1.5), darkMat);
    pylon.position.set(side * 3.1, -0.35, 1.3);
    wingGroup.add(pylon);
    // Navigation lights (v3 polish): red port / green starboard on the
    // wingtips — tiny self-lit dots that read as a real aircraft.
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff2a1a : 0x2aff66 }));
    nav.position.set(side * 5.9, -0.1, 1.55);
    wingGroup.add(nav);
    jet.add(wingGroup);
  }
  // Horizontal stabilators (v9, NEW): swept tailplanes at the rear — the old
  // jet had none, so from the chase camera the tail read as a bare stick.
  // Tailplanes + twin tails + twin nozzles are what make a fighter read as
  // a fighter from behind. Roots embed into the aft deck / nozzle sides.
  for (const side of [-1, 1]) {
    const stabGroup = new THREE.Group();
    stabGroup.rotation.z = -side * 0.12; // more anhedral than the wings
    const stab = new THREE.Mesh(trapezoidWing(side, 0.7, 3.4, 1.2, 0.1, -0.9, -1.3, 0.10), wingMat);
    stab.position.set(0, -0.42, 4.0); // low tailplane: clear gap under the main wings
    stabGroup.add(stab);
    const stabTip = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.1, 0.9), accentMat);
    stabTip.position.set(side * 3.3, -0.36, 4.5);
    stabGroup.add(stabTip);
    jet.add(stabGroup);
  }
  // Twin tail fins (v9): extruded swept planform — the old thin vertical
  // boxes read as white sticks from the chase camera. Swept-back, canted
  // outward, orange caps following the sweep, so the tail reads as a
  // fighter's twin-tail at a glance. Fins do not cast shadows (v4 lesson:
  // their hard shadow on the wing read as a black hole).
  // Fin planform helper: shape coords x = aft, y = up; the mesh is rotated
  // y=-90° so shape +x maps to +z (aft) and the extrusion is the thickness.
  function finPlanform(points, depth) {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) s.lineTo(points[i][0], points[i][1]);
    s.closePath();
    // v10: rounded bevel so the fin edge catches a light gradient, not a sharp pale slab.
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.07, bevelSegments: 2 });
    g.translate(0, 0, -depth / 2);
    return g;
  }
  for (const side of [-1, 1]) {
    const finGroup = new THREE.Group();
    finGroup.position.set(side * 0.88, 0.3, 2.9);
    finGroup.rotation.z = -side * 0.3; // cant outward
    // v9b: the old fins were tall and thin (0.18) — from the chase camera
    // they read as white sticks. Now shorter, thicker, longer root chord:
    // stubby swept tails, not sticks.
    const fin = new THREE.Mesh(finPlanform([[0, 0], [1.7, 1.8], [2.7, 1.8], [2.8, 0]], 0.3), finMat);
    fin.rotation.y = -Math.PI / 2;
    fin.name = 'fin';
    fin.castShadow = false;
    finGroup.add(fin);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 1.05), accentMat);
    finTip.name = 'finTip';
    finTip.position.set(0, 1.75, 2.2);
    finTip.castShadow = false;
    finGroup.add(finTip);
    jet.add(finGroup);
  }
  // Ventral fin under the aft deck: reads in banking shots.
  const ventral = new THREE.Mesh(finPlanform([[0, 0], [0.9, -0.9], [1.6, -0.9], [1.4, 0]], 0.14), darkMat);
  ventral.rotation.y = -Math.PI / 2;
  ventral.position.set(0, -0.25, 3.6);
  jet.add(ventral);
  // Side intakes: swept ramps with a dark recessed mouth — the intake
  // opening reads as an opening, not a black box on the fuselage.
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.85, 2.6), intakeMat);
    intake.position.set(side * 1.02, -0.1, -0.3);
    intake.rotation.y = -side * 0.12;
    jet.add(intake);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.08), darkMat);
    mouth.position.set(side * 1.02, -0.1, -1.56);
    mouth.rotation.y = -side * 0.12;
    jet.add(mouth);
  }
  // v10b: white tail light DELETED — in the cover shot it read as a white
  // bead between the two nozzle discs, completing a "face" (two eyes + nose).
  // Wingtip nav lights already give the aircraft its lights.
  // Spine stripe behind the canopy + antenna mast.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 3.2), darkMat);
  spine.position.set(0, 0.70, 2.4); // v10: sits on the lathe crown
  jet.add(spine);
  const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), darkMat);
  antenna.position.set(0, 0.86, 1.6);
  jet.add(antenna);
  // Twin afterburner flames, one per nozzle. Named burnerL/burnerR so
  // render.js can scale each flame in place (scaling a shared 'burner'
  // group would drift the flames sideways off their nozzles).
  // v10: flame smaller than the nozzle mouth (0.20 < 0.34) and deeper orange,
  // base recessed just ahead of the throat disc — it can never bulge out of
  // the nozzle as a pale egg, even at full throttle (render.js caps scale).
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.55 });
  for (const side of [-1, 1]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.20, 1.6, 10), flameMat);
    flame.rotation.x = Math.PI / 2; // apex pointing back
    flame.position.set(side * 0.68, 0.05, 6.3); // base at 5.5, apex at 7.1
    flame.name = side < 0 ? 'burnerL' : 'burnerR';
    jet.add(flame);
  }
  // v10b: light moved behind the tail (z 7.4) and dimmed — at z 6.4 it sat
  // inside the nozzle mouths and lit their interiors orange-brown ("eyes").
  const burnerLight = new THREE.PointLight(0xff8c2e, 12, 40);
  burnerLight.position.set(0, -0.3, 7.4);
  burnerLight.name = 'burnerLight';
  jet.add(burnerLight);
  jet.scale.setScalar(1.35); // big enough to read as a built aircraft, not a toy
  jet.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  // Fins opted out above (their hard shadow on the wing read as a black hole
  // in the landing shot) — the traverse above must not re-enable them.
  jet.traverse((o) => {
    if (o.isMesh && (o.name === 'fin' || o.name === 'finTip')) o.castShadow = false;
  });
  return jet;
}
