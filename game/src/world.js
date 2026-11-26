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

function terrainColor(h, slope, fbm, out) {
  // Layered desert strata: sand floor, red rock walls, pale caps, dark shadow bands.
  const sand = [0.78, 0.58, 0.36];
  const rock = [0.62, 0.32, 0.2];
  const rockDark = [0.42, 0.2, 0.13];
  const rockMid = [0.55, 0.26, 0.17];
  const pale = [0.85, 0.68, 0.48];
  const scrub = [0.42, 0.48, 0.24];
  let c;
  if (h < 6) c = sand;
  else if (h < 110) {
    // Strata bands wobble with the noise field and vary in thickness, so the walls
    // read as eroded rock layers instead of stacked cards: no band edge is level,
    // and four tones cycle instead of a strict two-tone alternation.
    const bandH = 11 + fbm * 5;
    const band = Math.floor((h + fbm * 20) / bandH);
    const palette = [rock, rockDark, rockMid, rockDark];
    c = palette[((band % 4) + 4) % 4];
  } else c = pale;
  const shade = 0.66 + 0.34 * clamp(1 - slope * 2.2, 0, 1);
  const jitter = 0.94 + 0.12 * fbm;
  out[0] = c[0] * shade * jitter;
  out[1] = c[1] * shade * jitter;
  out[2] = c[2] * shade * jitter;
  // Scrub patches near the river.
  if (h < 8 && fbm > 0.55) {
    out[0] = scrub[0];
    out[1] = scrub[1];
    out[2] = scrub[2];
  }
  return out;
}

export function buildTerrain(scene, heightAt, seed) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const fbm = makeFbm(seed + 7);
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
    terrainColor(h, slope, fbm(x * 0.01, z * 0.01), c);
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
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4a5a2a, roughness: 1, metalness: 0 });
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), shrubMat, 90);
  const nShrubs = place(shrubs, 90, (r) => {
    const z = 200 - r() * 3300;
    const d = 140 + r() * 260;
    const x = canyonCenter(z) + (r() < 0.5 ? -1 : 1) * d;
    const h = heightAt(x, z);
    if (h < 2 || h > 10) return null; // scrub hugs the damp floor near the river
    const s = 0.8 + r() * 1.6;
    return { x, y: h + s * 0.3, z, s, sy: s * 0.55 };
  });
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
  return { rocks: nRocks, shrubs: nShrubs, cacti: nCacti, pebbles: nPebbles };
}

export function buildRiver(scene) {
  // A winding ribbon of water down the canyon floor, catching the low sun.
  const pts = [];
  for (let z = 80; z >= -3200; z -= 60) pts.push(new THREE.Vector3(canyonCenter(z) + 18 * Math.sin(z * 0.004), WORLD.riverY, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  // Pale sandy banks under the water so the river reads as a channel, not a stripe.
  // Bank kept NARROW and desaturated (v3 fix): the old wide bright-orange bank
  // (radius 8.5, 0xd8b98a) read as a glowing road under the low sun.
  const bankGeo = new THREE.TubeGeometry(curve, 120, 7.6, 6, false);
  bankGeo.scale(1, 0.1, 1);
  const bank = new THREE.Mesh(bankGeo, new THREE.MeshStandardMaterial({ color: 0xc2b096, roughness: 1, metalness: 0 }));
  bank.position.y = -0.5;
  scene.add(bank);
  const geo = new THREE.TubeGeometry(curve, 120, 7, 6, false);
  geo.scale(1, 0.22, 1);
  // Water is blue-grey with a soft sky reflection — NO orange emissive (v3 fix):
  // the old emissive 0xff8c2e at 0.5 made the whole river glow orange like a road.
  // v4: from the chase angle the water still read as a black crack, so it now
  // carries a faint cool sky tint (emissive 0x24344d) and a lighter blue-grey
  // base — it reads as water, not a shadow.
  const mat = new THREE.MeshStandardMaterial({ color: 0x5e9dbd, roughness: 0.18, metalness: 0.85, emissive: 0x24344d, emissiveIntensity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
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

/** The jet, built from primitives: fuselage, canopy, delta wings, tail, intakes, afterburner. */
export function buildJet() {
  const jet = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b5, roughness: 0.42, metalness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x232830, roughness: 0.5, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fc3e0, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.7 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.92, 8.2, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  jet.add(fuselage);
  // Tapered tail cone so the rear never reads as a flat disc from the chase camera.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.2, 12), bodyMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.8;
  jet.add(tail);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.72, 3.4, 12), accentMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.3;
  jet.add(nose);
  // Pale sky-glass canopy: reads as glass at golden hour, not a dark green blob.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), glassMat);
  canopy.scale.set(0.72, 0.42, 1.9);
  canopy.position.set(0, 0.7, -1.6);
  jet.add(canopy);
  // Main wings: swept flat boxes — clearly horizontal from the chase camera.
  // v4: an orange leading-edge stripe on each wing, so the aircraft's direction
  // reads at a glance even in a banking shot (the old plain grey slabs made the
  // jet look symmetric nose-to-tail in the ring shot).
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.18, 2.8), bodyMat);
    wing.rotation.y = -side * 0.55; // sweep the tip back
    wing.position.set(side * 3.0, -0.1, 1.5);
    jet.add(wing);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.2, 0.35), accentMat);
    edge.rotation.y = -side * 0.55;
    edge.position.set(side * 3.7, -0.1, 0.35);
    jet.add(edge);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 1.6), accentMat);
    tip.rotation.y = -side * 0.55;
    tip.position.set(side * 5.3, -0.1, 2.9);
    jet.add(tip);
  }
  // Tail fins: smaller, with a faint self-lit pale material, so they read as fins
  // instead of two big dark slabs when the chase camera looks into their shadow side.
  const finMat = new THREE.MeshStandardMaterial({ color: 0xb8c4d0, roughness: 0.45, metalness: 0.3, emissive: 0x30343c, emissiveIntensity: 0.6 });
  const tailGeo = new THREE.BoxGeometry(0.18, 1.3, 1.4);
  const tailL = new THREE.Mesh(tailGeo, finMat);
  tailL.position.set(-1.0, 0.85, 3.4);
  tailL.rotation.z = 0.25;
  jet.add(tailL);
  const tailR = new THREE.Mesh(tailGeo, finMat);
  tailR.position.set(1.0, 0.85, 3.4);
  tailR.rotation.z = -0.25;
  jet.add(tailR);
  for (const side of [-1, 1]) {
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 1.0), accentMat);
    finTip.name = 'finTip';
    finTip.position.set(side * 1.18, 1.5, 3.4);
    finTip.rotation.z = -side * 0.25;
    jet.add(finTip);
  }
  // Intakes.
  for (const side of [-1, 1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 2.2), darkMat);
    intake.position.set(side * 1.15, -0.2, -0.6);
    jet.add(intake);
  }
  // Navigation lights (v3 polish): red port / green starboard on the wingtips,
  // white tail light — tiny self-lit dots that read as a real aircraft at a glance.
  const navRed = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  navRed.position.set(-5.5, -0.1, 2.9);
  jet.add(navRed);
  const navGreen = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff66 }));
  navGreen.position.set(5.5, -0.1, 2.9);
  jet.add(navGreen);
  const navWhite = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
  navWhite.position.set(0, 0.4, 5.6);
  navWhite.name = 'tailLight';
  jet.add(navWhite);
  // Spine stripe + antenna mast (v3 polish): a thin dark panel line along the
  // fuselage top and a small mast — detail that reads from the chase camera.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 6.4), darkMat);
  spine.position.set(0, 0.78, -0.4);
  jet.add(spine);
  const antenna = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 6), darkMat);
  antenna.position.set(0, 1.1, 1.2);
  jet.add(antenna);
  // Afterburner glow: a short flame cone, apex pointing back.
  const burner = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 2.2, 10),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.6 }),
  );
  burner.rotation.x = Math.PI / 2;
  burner.position.z = 5.0;
  burner.name = 'burner';
  jet.add(burner);
  const burnerLight = new THREE.PointLight(0xff8c2e, 12, 40);
  burnerLight.position.z = 5;
  burnerLight.name = 'burnerLight';
  jet.add(burnerLight);
  jet.scale.setScalar(1.35); // big enough to read as a built aircraft, not a toy
  jet.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  // The tail fins' hard shadow on the wing reads as a black hole at a glance
  // (landing shot) — the fins are small, so they simply do not cast shadows.
  tailL.castShadow = false;
  tailR.castShadow = false;
  jet.traverse((o) => { if (o.isMesh && o.name === 'finTip') o.castShadow = false; });
  return jet;
}
