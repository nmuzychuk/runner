// Procedural sound engine (Web Audio). No asset files — everything is
// synthesized with oscillators + noise so the game stays dependency-free and
// works on static hosting (GitHub Pages).
//
// Usage:
//   const sound = new Sound({ muted: localStorage.getItem('airraid_muted') === '1' });
//   sound.unlock();          // call on first user gesture (start / keydown)
//   sound.play('hit');
//   sound.startSiren();      // continuous air-raid siren while running
//   sound.stopSiren();
//   sound.duck(0.4);         // duck the siren (e.g., while paused)
//   sound.setMuted(true);
//
// The class is defensive: if AudioContext is unavailable (very old browsers,
// or headless test environments) every method is a no-op and the game still
// runs.

const SFX = {
  move: {
    notes: [
      { f: 220, t: 'sine', dur: 0.06, g: 0.18, when: 0 },
      { f: 330, t: 'sine', dur: 0.05, g: 0.14, when: 0.04 },
    ],
  },
  hit: {
    noise: { dur: 0.18, g: 0.55, filter: 900, slope: 'lowpass', when: 0 },
    notes: [
      { f: 180, f1: 40, t: 'sawtooth', dur: 0.3, g: 0.45, when: 0 },
      { f: 60, t: 'sine', dur: 0.4, g: 0.4, when: 0.02 },
    ],
  },
  collect: {
    // `when` is per-note; the caller passes a starting frequency by item.
    base: true,
  },
  milestone: {
    notes: [
      { f: 523, t: 'sine', dur: 0.12, g: 0.2, when: 0 },
      { f: 659, t: 'sine', dur: 0.12, g: 0.2, when: 0.1 },
      { f: 784, t: 'sine', dur: 0.2, g: 0.22, when: 0.2 },
    ],
  },
  gameover: {
    noise: { dur: 0.6, g: 0.2, filter: 600, slope: 'lowpass', when: 0 },
    notes: [
      { f: 220, f1: 55, t: 'sawtooth', dur: 0.9, g: 0.4, when: 0 },
      { f: 110, f1: 40, t: 'sine', dur: 1.1, g: 0.35, when: 0.05 },
      { f: 60, t: 'sine', dur: 1.4, g: 0.35, when: 0.1 },
    ],
  },
  // Debris chunk slams the road: a dull thud + a short dusty "crack" of
  // noise. Deliberately softer and lower than `hit` (no alarm feel).
  debris_land: {
    noise: { dur: 0.22, g: 0.32, filter: 700, slope: 'lowpass', when: 0 },
    notes: [
      { f: 90, f1: 42, t: 'sine', dur: 0.28, g: 0.4, when: 0 },
      { f: 55, t: 'sine', dur: 0.35, g: 0.3, when: 0.01 },
    ],
  },
};

const COLLECT_BASE_FREQ = {
  phone: 720,
  flashlight: 640,
  water: 560,
  firstaid: 880,
};

export class Sound {
  constructor({ muted = false } = {}) {
    this._muted = !!muted;
    this._ctx = null;
    this._master = null;
    this._sirenNodes = null;
    this._sirenTargetGain = 1; // 0..1, applied to the siren gain node
    this._droneNodes = null;
    this._droneTargetGain = 1; // 0..1, applied to the drone hum gain node
  }

  get muted() {
    return this._muted;
  }

  setMuted(v) {
    this._muted = !!v;
    if (this._master) {
      this._master.gain.setTargetAtTime(
        this._muted ? 0 : 1,
        this._ctx.currentTime,
        0.05,
      );
    }
  }

  // Lazily create AudioContext. Call `unlock()` from a user gesture to satisfy
  // browser autoplay policies.
  unlock() {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') this._ctx.resume();
      return;
    }
    const AC =
      window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this._ctx = new AC();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._muted ? 0 : 1;
    this._master.connect(this._ctx.destination);
  }

  // ------------------------------------------------------------------
  // Low-level synth primitives
  // ------------------------------------------------------------------

  _osc({
    f = 440,
    f1,
    type = 'sine',
    dur = 0.1,
    gain = 0.2,
    when = 0,
    attack = 0.004,
    release = 0.08,
  }) {
    if (!this._ctx) return;
    const t0 = this._ctx.currentTime + when;
    const o = this._ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.setTargetAtTime(0, t0 + Math.max(attack, dur - release), Math.max(0.01, release / 3));
    o.connect(g);
    g.connect(this._master);
    o.start(t0);
    o.stop(t0 + dur + 0.2);
  }

  _noise({ dur = 0.1, gain = 0.3, filter = 1000, slope = 'lowpass', when = 0 } = {}) {
    if (!this._ctx) return;
    const t0 = this._ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this._ctx.sampleRate * dur));
    const buf = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const filt = this._ctx.createBiquadFilter();
    filt.type = slope;
    filt.frequency.value = filter;
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this._master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------------
  // Named SFX
  // ------------------------------------------------------------------

  play(name, opts = {}) {
    if (!this._ctx || this._muted) return;
    if (name === 'move') {
      for (const n of SFX.move.notes) this._osc(n);
      return;
    }
    if (name === 'jump') {
      this._osc({ f: 260, type: 'triangle', dur: 0.1, gain: 0.18 });
      this._osc({ f: 390, type: 'triangle', dur: 0.12, gain: 0.14, when: 0.05 });
      return;
    }
    if (name === 'crouch') {
      this._osc({ f: 200, type: 'sine', dur: 0.12, gain: 0.15 });
      this._osc({ f: 140, type: 'sine', dur: 0.14, gain: 0.13, when: 0.05 });
      return;
    }
    if (name === 'hit') {
      if (SFX.hit.noise) this._noise(SFX.hit.noise);
      for (const n of SFX.hit.notes) this._osc(n);
      return;
    }
    if (name === 'collect') {
      const base = COLLECT_BASE_FREQ[opts.item] || 640;
      // Two quick notes, second is a fifth up, gives a pleasant "pick-up" feel.
      this._osc({ f: base, type: 'triangle', dur: 0.08, gain: 0.22, when: 0 });
      this._osc({ f: base * 1.5, type: 'triangle', dur: 0.14, gain: 0.22, when: 0.07 });
      return;
    }
    if (name === 'milestone') {
      for (const n of SFX.milestone.notes) this._osc(n);
      return;
    }
    if (name === 'gameover') {
      if (SFX.gameover.noise) this._noise(SFX.gameover.noise);
      for (const n of SFX.gameover.notes) this._osc(n);
      return;
    }
    if (name === 'debris_land') {
      if (SFX.debris_land.noise) this._noise(SFX.debris_land.noise);
      for (const n of SFX.debris_land.notes) this._osc(n);
      return;
    }
  }

  // ------------------------------------------------------------------
  // Continuous air-raid siren (two detuned triangle oscillators with a
  // ~0.4 Hz LFO wailing between ~240 and ~840 Hz).
  // ------------------------------------------------------------------

  startSiren() {
    this.unlock();
    if (!this._ctx || this._sirenNodes) return;
    const ctx = this._ctx;
    const t0 = ctx.currentTime;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.35;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 300;
    lfo.connect(lfoAmt);

    const mkOsc = (detune, f) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = detune;
      lfoAmt.connect(o.frequency);
      return o;
    };
    const o1 = mkOsc(0, 540);
    const o2 = mkOsc(8, 540);

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 1200;
    filt.Q.value = 2;

    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05 * this._sirenTargetGain, t0 + 1.2);

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    g.connect(this._master);

    lfo.start(t0);
    o1.start(t0);
    o2.start(t0);

    this._sirenNodes = { lfo, o1, o2, gain: g };
  }

  stopSiren() {
    if (!this._sirenNodes || !this._ctx) return;
    const { lfo, o1, o2, gain } = this._sirenNodes;
    const t0 = this._ctx.currentTime;
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setTargetAtTime(0, t0, 0.25);
    const stopAt = t0 + 1;
    try { lfo.stop(stopAt); o1.stop(stopAt); o2.stop(stopAt); } catch (e) { /* already stopped */ }
    this._sirenNodes = null;
  }

  // 0..1 — ducks the siren (e.g., to 0.4 while paused, back to 1 when running).
  duck(level) {
    this._sirenTargetGain = Math.max(0, Math.min(1, level));
    if (this._sirenNodes && this._ctx) {
      this._sirenNodes.gain.gain.setTargetAtTime(
        0.05 * this._sirenTargetGain,
        this._ctx.currentTime,
        0.3,
      );
    }
  }

  // ------------------------------------------------------------------
  // Continuous Shahed-style drone hum. Modelled on a 2-stroke piston
  // engine: a low sawtooth ~110 Hz whose amplitude is "chugged" by a
  // ~9 Hz LFO (the put-put-put), plus a slightly detuned second voice and
  // a rough 16 Hz beat. Runs only while an incoming drone is on screen.
  // Separate node set from the siren so the two can overlap freely.
  // ------------------------------------------------------------------

  startDrone() {
    this.unlock();
    if (!this._ctx || this._droneNodes) return;
    const ctx = this._ctx;
    const t0 = ctx.currentTime;

    // Amplitude "chug" — the signature 2-stroke put-put-put.
    const chug = ctx.createOscillator();
    chug.type = 'sine';
    chug.frequency.value = 9;
    const chugAmt = ctx.createGain();
    chugAmt.gain.value = 0.5; // 50% depth of the gain below
    chug.connect(chugAmt);

    // Slow rotor/engine beat for a menacing, unstable pitch.
    const wobble = ctx.createOscillator();
    wobble.type = 'sine';
    wobble.frequency.value = 3.5;
    const wobbleAmt = ctx.createGain();
    wobbleAmt.gain.value = 12; // Hz of pitch wobble
    wobble.connect(wobbleAmt);

    const mkOsc = (f, detune) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = detune;
      wobbleAmt.connect(o.frequency);
      return o;
    };
    const o1 = mkOsc(110, 0);
    const o2 = mkOsc(110, 10); // a bit of beating

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 850;
    filt.Q.value = 1.4;

    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.07 * this._droneTargetGain, t0 + 0.8);
    chugAmt.connect(g.gain); // amplitude wobble rides on top of the base level

    o1.connect(filt);
    o2.connect(filt);
    filt.connect(g);
    g.connect(this._master);

    chug.start(t0);
    wobble.start(t0);
    o1.start(t0);
    o2.start(t0);

    this._droneNodes = { chug, wobble, o1, o2, gain: g };
  }

  stopDrone() {
    if (!this._droneNodes || !this._ctx) return;
    const { chug, wobble, o1, o2, gain } = this._droneNodes;
    const t0 = this._ctx.currentTime;
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setTargetAtTime(0, t0, 0.2);
    const stopAt = t0 + 0.9;
    try { chug.stop(stopAt); wobble.stop(stopAt); o1.stop(stopAt); o2.stop(stopAt); } catch (e) { /* already stopped */ }
    this._droneNodes = null;
  }

  // 0..1 — scale the drone hum (e.g., 0.2 while paused, back to 1 when running).
  duckDrone(level) {
    this._droneTargetGain = Math.max(0, Math.min(1, level));
    if (this._droneNodes && this._ctx) {
      this._droneNodes.gain.gain.setTargetAtTime(
        0.07 * this._droneTargetGain,
        this._ctx.currentTime,
        0.3,
      );
    }
  }

  dispose() {
    this.stopSiren();
    this.stopDrone();
    if (this._ctx) {
      try { this._ctx.close(); } catch (e) { /* already closed */ }
      this._ctx = null;
      this._master = null;
    }
  }
}
