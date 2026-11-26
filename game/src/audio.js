// Golden Hour Canyon Run — WebAudio sounds, synthesised, no audio files.
// Engine hum follows throttle, wind follows speed, chimes mark rings, thuds mark trouble.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let windSrc = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      // Engine: two detuned saws through a lowpass, pitch rises with throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 58;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise buffer through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
      if (engineGain) engineGain.gain.value = m ? 0 : engineGain.gain.value;
    },
    /** Call every frame: engine + wind follow the flight. */
    update(throttle, speed, flying) {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const target = muted || !flying ? 0 : 0.028 + throttle * 0.05;
      if (engineGain) engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      if (engineOsc) engineOsc.frequency.setTargetAtTime(50 + throttle * 70, ctx.currentTime, 0.1);
      if (windGain) windGain.gain.setTargetAtTime(muted ? 0 : Math.min(0.09, (speed / 210) * 0.09), ctx.currentTime, 0.15);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.5, 'sine', 0.12, 0.07);
    },
    thud() {
      tone(90, 0.4, 'triangle', 0.3);
      tone(55, 0.5, 'sine', 0.25, 0.02);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'sine', 0.14, i * 0.12));
    },
    crash() {
      tone(160, 0.7, 'sawtooth', 0.2);
      tone(70, 1.0, 'triangle', 0.25, 0.1);
    },
    click() {
      tone(660, 0.08, 'sine', 0.08);
    },
  };
}
