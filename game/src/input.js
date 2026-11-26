// Golden Hour Canyon Run — keyboard + mouse steering. One object, read every frame.
export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: 0, y: 0, active: false, down: false };
  let paused = false;
  let muted = false;
  const pressed = new Set();

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (e.code === 'Escape') paused = !paused;
    if (e.code === 'KeyM') muted = !muted;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    mouse.active = true;
  }
  function onMouseDown() {
    mouse.down = true;
    mouse.active = true;
  }
  function onMouseUp() {
    mouse.down = false;
  }
  function onBlur() {
    keys.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  return {
    /** Control vector for this frame: bank -1..1, pitch -1..1, throttle keys. */
    read() {
      let bank = 0;
      let pitch = 0;
      // bank > 0 turns LEFT (yaw decreases): A banks left, D banks right.
      if (keys.has('KeyA') || keys.has('ArrowLeft')) bank += 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) bank -= 1;
      if (keys.has('ArrowUp')) pitch += 1;
      if (keys.has('ArrowDown')) pitch -= 1;
      // Mouse steering: hold the mouse to bank toward it and pitch toward it.
      if (mouse.down && mouse.active) {
        bank = Math.max(-1, Math.min(1, -mouse.x * 1.4));
        pitch = Math.max(-1, Math.min(1, -mouse.y * 1.2));
      }
      return {
        bank,
        pitch,
        throttleUp: keys.has('KeyW'),
        throttleDown: keys.has('KeyS'),
      };
    },
    wasPressed(code) {
      const hit = pressed.has(code);
      if (hit) pressed.delete(code);
      return hit;
    },
    consumePressed() {
      pressed.clear();
    },
    isPaused() {
      return paused;
    },
    setPaused(v) {
      paused = v;
    },
    isMuted() {
      return muted;
    },
    get mouse() {
      return mouse;
    },
  };
}
