// Golden Hour Canyon Run — the Three.js scene: golden-hour light, chase camera, the jet.
import * as THREE from 'three';
import { buildTerrain, buildScatter, buildRiver, buildRunways, buildRings, buildSky, buildBirds, buildJet, makeHeightAt, makeRings } from './world.js';
import { MODES } from './config.js';

export function createRender(canvas, seed, modeKey) {
  const mode = MODES[modeKey];
  const heightAt = makeHeightAt(seed);
  const rings = makeRings(seed, mode.rings, mode.ringRadius);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1a12);
  scene.fog = new THREE.Fog(0xc98a4e, 500, 3400);

  // Golden hour: low warm sun from the west, cool fill from the sky.
  const sun = new THREE.DirectionalLight(0xffb066, 3.2);
  sun.position.set(-900, 320, 900);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 2600;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffd9a8, 0x4a2c1c, 0.85));
  const fill = new THREE.DirectionalLight(0x7fa8d8, 0.35);
  fill.position.set(600, 400, -800);
  scene.add(fill);

  buildTerrain(scene, heightAt, seed);
  buildScatter(scene, heightAt, seed);
  buildRiver(scene);
  buildRunways(scene);
  const ringMeshes = buildRings(scene, rings);
  const { clouds } = buildSky(scene, seed);
  const birds = buildBirds(scene, seed);
  const jet = buildJet();
  scene.add(jet);

  // Gradient sky dome: warm horizon, deep blue-violet up top.
  const skyGeo = new THREE.SphereGeometry(3800, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2c3a6e) },
      mid: { value: new THREE.Color(0xc97a3e) },
      low: { value: new THREE.Color(0xff9a3e) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 low; void main(){ float h = normalize(vP).y; vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.9, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 8000);
  const camPos = new THREE.Vector3(0, 10, 20);
  const camLook = new THREE.Vector3(0, 5, -10);
  let time = 0;

  // Dust trail: a ring buffer of pale motes left behind the jet's tail, so the
  // aircraft reads as moving through air instead of sliding over a still picture.
  // Points are render-only (never touch the flight model or the seeded world).
  // v3 fix: the old square PointsMaterial motes read as hard little blocks up close,
  // so each mote is now a SOFT ROUND sprite (canvas radial gradient, same trick as
  // the sun halo) — pale desert dust, fainter, spread wider, fading faster, so the
  // trail reads as thin dust, never as a solid line.
  const dustCanvas = document.createElement('canvas');
  dustCanvas.width = 64;
  dustCanvas.height = 64;
  const dctx = dustCanvas.getContext('2d');
  const dgrad = dctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  dgrad.addColorStop(0, 'rgba(255,255,255,1)');
  dgrad.addColorStop(0.5, 'rgba(255,255,255,0.4)');
  dgrad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = dgrad;
  dctx.fillRect(0, 0, 64, 64);
  const dustTex = new THREE.CanvasTexture(dustCanvas);
  // v4 middle ground: the v3 trail was so faint it vanished in stills, so the
  // motes are a touch bigger, brighter and more numerous — a thin visible trail,
  // still far from a solid line.
  const DUST_N = 110;
  const dustPos = new Float32Array(DUST_N * 3);
  for (let i = 0; i < DUST_N; i += 1) dustPos[i * 3 + 1] = -999;
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xe6d9c2, size: 3.6, sizeAttenuation: true, map: dustTex, transparent: true, opacity: 0.32, alphaTest: 0.01, depthWrite: false }));
  dust.frustumCulled = false;
  scene.add(dust);
  let dustCursor = 0;
  function spawnDust(p) {
    if (p.speed < 40) return;
    const fx = Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    for (let k = 0; k < 3; k += 1) {
      const i = dustCursor;
      dustCursor = (dustCursor + 1) % DUST_N;
      dustPos[i * 3] = p.x - fx * 6 + (Math.random() - 0.5) * 6;
      dustPos[i * 3 + 1] = p.y + 0.3 + (Math.random() - 0.5) * 2.5;
      dustPos[i * 3 + 2] = p.z - fz * 6 + (Math.random() - 0.5) * 6;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** Place the jet mesh from the flight state. */
  function poseJet(p) {
    jet.position.set(p.x, p.y, p.z);
    jet.rotation.order = 'YXZ';
    jet.rotation.y = -p.yaw;
    jet.rotation.x = -p.pitch;
    jet.rotation.z = p.bank;
    // Twin afterburner flames (v9): scale each flame in place so they stay
    // glued to their nozzles (scaling a shared group would drift them
    // sideways off the nozzles).
    const burners = [jet.getObjectByName('burnerL'), jet.getObjectByName('burnerR')].filter(Boolean);
    const light = jet.getObjectByName('burnerLight');
    // v10: flame scale CAPPED — the old scale (up to 1.7 wide) blew the flame
    // wider than the nozzle mouth (0.30), so it read as two pale eggs at the
    // tail. Now max radius 0.20 × 0.95 = 0.19 < mouth 0.34. Light dimmed too:
    // intensity 18 at the nozzle mouths blasted them pale yellow.
    const s = Math.min(0.6 + p.throttle * 1.1 + (p.phase === 'takeoff' ? 0.3 : 0), 0.95);
    for (const b of burners) {
      b.scale.set(s, s, 0.7 + p.throttle * 0.9);
      b.material.opacity = 0.3 + p.throttle * 0.4;
    }
    if (light) light.intensity = 1.0 + p.throttle * 2.0;
    // Ring pulse: the next ring glows harder; passed rings go dim green.
    for (let i = 0; i < rings.length; i += 1) {
      const m = ringMeshes[i];
      if (!m) continue;
      if (rings[i].passed) {
        m.material.emissive.setHex(0x1a8a3a);
        m.material.emissiveIntensity = 0.7;
      } else if (i === p.ringsPassed) {
        m.material.emissiveIntensity = 1.6 + Math.sin(time * 5) * 0.7;
      } else {
        m.material.emissiveIntensity = 1.1;
      }
    }
    // Sun shadow follows the jet so shadows stay crisp where the action is.
    sun.position.set(p.x - 900, 320, p.z + 900);
    sun.target.position.set(p.x, 0, p.z);
    sun.target.updateMatrixWorld();
    skyDome.position.set(p.x, 0, p.z);
  }

  /** Chase camera: behind and above the jet, smoothed, never fighting the pilot. */
  function chaseCamera(p, dt) {
    const back = 17 + p.speed * 0.028;
    const up = 5.2 + p.speed * 0.008;
    const fx = Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    const tx = p.x - fx * back - Math.sin(p.bank) * 2;
    const ty = p.y + up + Math.sin(p.pitch) * 4;
    const tz = p.z - fz * back;
    const k = 1 - Math.exp(-dt * 5.5);
    camPos.x += (tx - camPos.x) * k;
    camPos.y += (ty - camPos.y) * k;
    camPos.z += (tz - camPos.z) * k;
    camLook.x += (p.x + fx * 40 - camLook.x) * (1 - Math.exp(-dt * 7));
    camLook.y += (p.y + Math.sin(p.pitch) * 18 - camLook.y) * (1 - Math.exp(-dt * 7));
    camLook.z += (p.z + fz * 40 - camLook.z) * (1 - Math.exp(-dt * 7));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = 62 + clamp(p.speed / 210, 0, 1) * 10;
    camera.updateProjectionMatrix();
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  return {
    rings,
    heightAt,
    resize,
    render(p, dt) {
      time += dt;
      poseJet(p);
      chaseCamera(p, dt);
      spawnDust(p);
      // Clouds drift; birds flap and circle.
      clouds.position.x = Math.sin(time * 0.004) * 120;
      clouds.position.z = Math.sin(time * 0.002) * 60;
      for (const bird of birds) {
        bird.position.x += Math.sin(time * 0.3 + bird.userData.phase) * 0.02 + Math.cos(time * 0.22 + bird.userData.phase) * 0.03;
        bird.position.z -= bird.userData.speed * dt * 8;
        if (bird.position.z < -2900) bird.position.z = -100;
        const flap = Math.sin(time * 9 + bird.userData.phase) * 0.55;
        bird.userData.left.rotation.z = flap;
        bird.userData.right.rotation.z = -flap;
      }
      renderer.render(scene, camera);
    },
    /** One static frame from the current pose (used by screenshot staging). */
    renderStill(p) {
      poseJet(p);
      // Put the camera exactly behind the jet for a composed still.
      const back = 17 + p.speed * 0.028;
      const up = 5.2;
      const fx = Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      camera.position.set(p.x - fx * back, p.y + up, p.z - fz * back);
      camera.lookAt(p.x + fx * 40, p.y, p.z + fz * 40);
      camera.fov = 62;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    },
  };
}
