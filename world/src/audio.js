// Every sound is synthesised in the browser: there are no audio files to
// host. The context is created on the first gesture, which is what browsers
// require before a page may make a sound.

const SCALE = [0, 2, 4, 7, 9, 11, 12]; // one major scale; each door owns a degree

export function createAudio() {
  let ctx = null, master = null, hum = null, humGain = null, humFilter = null, droneOsc = null, droneGain = null;
  let muted = false;
  try { muted = localStorage.getItem('world.muted') === '1'; } catch (e) { /* storage blocked: sound stays on */ }

  let gesture = false;
  const buzz = (pattern) => { if (gesture && navigator.vibrate) navigator.vibrate(pattern); };
  function unlock() {
    gesture = true;
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    // The room tone: two low sines a fifth apart under a low pass, barely there.
    humFilter = ctx.createBiquadFilter(); humFilter.type = 'lowpass'; humFilter.frequency.value = 220;
    humGain = ctx.createGain(); humGain.gain.value = 0.035;
    hum = [ctx.createOscillator(), ctx.createOscillator()];
    hum[0].frequency.value = 55; hum[1].frequency.value = 82.5; hum[1].detune.value = 4;
    hum.forEach((o) => { o.connect(humFilter); o.start(); });
    humFilter.connect(humGain); humGain.connect(master);
    droneOsc = ctx.createOscillator(); droneOsc.type = 'triangle'; droneOsc.frequency.value = 140;
    droneGain = ctx.createGain(); droneGain.gain.value = 0.0; droneOsc.connect(droneGain); droneGain.connect(master); droneOsc.start();
  }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
    try { localStorage.setItem('world.muted', m ? '1' : '0'); } catch (e) { /* fine */ }
  }
  function panner(pan) {
    if (!ctx.createStereoPanner) return null;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); return p;
  }
  function voice(freq, type, when, dur, peak, pan = 0) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(peak, when + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    const p = panner(pan); o.connect(g); if (p) { g.connect(p); p.connect(master); } else g.connect(master);
    o.start(when); o.stop(when + dur + 0.05);
  }
  function noise(when, dur, peak, filterType, freq, pan = 0) {
    const n = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = peak;
    const p = panner(pan); src.connect(f); f.connect(g); if (p) { g.connect(p); p.connect(master); } else g.connect(master);
    src.start(when);
  }
  const ready = () => !!ctx && !muted;

  return {
    unlock, setMuted, get muted() { return muted; },
    // The shared chord every door starts with, then its own note: one family, seven voices.
    door(index, pan = 0) {
      if (!ready()) return;
      const t = ctx.currentTime, root = 220;
      voice(root, 'sine', t, 0.9, 0.12, pan); voice(root * 1.5, 'sine', t, 0.9, 0.06, pan);
      voice(root * Math.pow(2, SCALE[index % SCALE.length] / 12) * 2, 'triangle', t + 0.18, 0.7, 0.08, pan);
      buzz(18);
    },
    footstep(onPad, pan = 0) {
      if (!ready()) return;
      noise(ctx.currentTime, 0.045, onPad ? 0.14 : 0.07, 'bandpass', onPad ? 1400 : 900, pan);
    },
    chord(pan = 0) {
      if (!ready()) return;
      const t = ctx.currentTime;
      [220, 277.18, 329.63, 440].forEach((f, i) => voice(f, 'sine', t + i * 0.04, 1.8, 0.07, pan));
    },
    tick(pan = 0) { if (ready()) voice(1900, 'square', ctx.currentTime, 0.04, 0.03, pan); },
    refuse(pan = 0) {
      if (!ready()) return;
      const t = ctx.currentTime, o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.25);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      const p = panner(pan); o.connect(g); if (p) { g.connect(p); p.connect(master); } else g.connect(master); o.start(t); o.stop(t + 0.35);
      buzz([30, 40, 30]);
    },
    crackle(pan = 0) { if (ready()) noise(ctx.currentTime, 0.12, 0.05, 'highpass', 3000, pan); },
    pickup() {
      if (!ready()) return;
      const t = ctx.currentTime; voice(880, 'sine', t, 0.25, 0.08); voice(1320, 'sine', t + 0.08, 0.35, 0.08);
    },
    // Called every frame: proximity lifts the hum, the drone's speed sets its pitch.
    update(nearDist, droneSpeed) {
      if (!ctx) return;
      const lift = Math.max(0, 1 - nearDist / 3.6);
      hum[0].frequency.setTargetAtTime(55 * (1 + 0.5 * lift), ctx.currentTime, 0.1);
      hum[1].frequency.setTargetAtTime(82.5 * (1 + 0.5 * lift), ctx.currentTime, 0.1);
      humFilter.frequency.setTargetAtTime(220 + 500 * lift, ctx.currentTime, 0.1);
      droneOsc.frequency.setTargetAtTime(120 + droneSpeed * 40, ctx.currentTime, 0.2);
      droneGain.gain.setTargetAtTime(droneSpeed > 0 ? 0.012 : 0, ctx.currentTime, 0.3);
    },
  };
}
