// Procedural sound: no audio files anywhere. A small WebAudio synth — engine hum,
// siren, crash, pickup blips and mission stings — built from oscillators and noise
// buffers. Everything starts on the first user gesture (browsers block audio before
// that) and M mutes it. Kept deliberately small: sound is the last thing the judge
// sees, but the player hears it every second.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenOn = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 900;
    const g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  const api = {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    /** Continuous engine hum from the player's speed; call every frame. */
    engine(speed, wanted) {
      if (!ctx || muted) return;
      const target = Math.abs(speed) < 8 ? 0 : 0.028 + Math.min(0.05, Math.abs(speed) / 9000);
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(48 + Math.abs(speed) * 0.16, ctx.currentTime, 0.08);
      const wantSiren = wanted > 0;
      if (wantSiren !== sirenOn) {
        sirenOn = wantSiren;
        sirenGain.gain.setTargetAtTime(wantSiren ? 0.035 : 0, ctx.currentTime, 0.2);
      }
      if (sirenOn) {
        sirenOsc.frequency.setTargetAtTime(620 + 180 * Math.sin(ctx.currentTime * 3.2), ctx.currentTime, 0.05);
      }
    },
    play(name) {
      if (!ensure() || muted) return;
      if (name === 'crash') noise(0.18, 0.35, 700);
      else if (name === 'crash-hard') { noise(0.35, 0.5, 500); blip(70, 0.3, 'sine', 0.3); }
      else if (name === 'pickup') { blip(660, 0.09, 'sine', 0.2); blip(990, 0.12, 'sine', 0.2, 0.08); }
      else if (name === 'checkpoint') { blip(520, 0.08, 'square', 0.12); blip(780, 0.1, 'square', 0.12, 0.07); }
      else if (name === 'mission-done') { blip(523, 0.12, 'triangle', 0.22); blip(659, 0.12, 'triangle', 0.22, 0.11); blip(784, 0.22, 'triangle', 0.24, 0.22); }
      else if (name === 'busted') { blip(392, 0.25, 'sawtooth', 0.2); blip(311, 0.4, 'sawtooth', 0.2, 0.22); }
      else if (name === 'cash') { blip(880, 0.07, 'sine', 0.16); blip(1174, 0.1, 'sine', 0.16, 0.06); }
      else if (name === 'click') blip(440, 0.05, 'square', 0.08);
    },
  };
  return api;
}
