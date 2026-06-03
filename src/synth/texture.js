// Vinyl-style texture layer: continuous low-passed white noise (hiss) plus
// sparse bandpassed bursts (crackle). Mixed into the master output as a
// background bed. Only activated for lofi — other genres want clean sound.
//
// Construction parks all the persistent nodes and starts the looping hiss
// source. setActive(on) fades the gain stages in/out and gates the
// recurring crackle scheduler.

function createNoiseSource(audioCtx, durationSec = 2) {
  const len = Math.floor(audioCtx.sampleRate * durationSec);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const node = audioCtx.createBufferSource();
  node.buffer = buf;
  node.loop = true;
  return node;
}

export class VinylTexture {
  constructor(audioCtx, destination) {
    this.audioCtx = audioCtx;
    this.destination = destination;
    this.active = false;
    this.crackleTimer = null;

    // Hiss bus: looping noise → LPF → gain → destination
    this.hissGain = audioCtx.createGain();
    this.hissGain.gain.value = 0;
    const hissFilter = audioCtx.createBiquadFilter();
    hissFilter.type = 'lowpass';
    hissFilter.frequency.value = 2200;
    const hissNoise = createNoiseSource(audioCtx);
    hissNoise.connect(hissFilter);
    hissFilter.connect(this.hissGain);
    this.hissGain.connect(destination);
    hissNoise.start();

    // Crackle bus is just a gain stage; transient bursts get wired into
    // it on demand by emitCrackle().
    this.crackleGain = audioCtx.createGain();
    this.crackleGain.gain.value = 0;
    this.crackleGain.connect(destination);
  }

  setActive(on) {
    this.active = on;
    const now = this.audioCtx.currentTime;
    if (on) {
      this.hissGain.gain.cancelScheduledValues(now);
      this.hissGain.gain.linearRampToValueAtTime(0.035, now + 0.8);
      this.crackleGain.gain.cancelScheduledValues(now);
      this.crackleGain.gain.linearRampToValueAtTime(0.7, now + 0.8);
      if (!this.crackleTimer) this._scheduleNextCrackle();
    } else {
      this.hissGain.gain.cancelScheduledValues(now);
      this.hissGain.gain.linearRampToValueAtTime(0, now + 0.4);
      this.crackleGain.gain.cancelScheduledValues(now);
      this.crackleGain.gain.linearRampToValueAtTime(0, now + 0.4);
      if (this.crackleTimer) {
        clearTimeout(this.crackleTimer);
        this.crackleTimer = null;
      }
    }
  }

  _scheduleNextCrackle() {
    if (!this.active) return;
    // 0.3–2.0s between crackle events. Aim for sparse, not constant.
    const delayMs = 300 + Math.random() * 1700;
    this.crackleTimer = setTimeout(() => this._emitCrackle(), delayMs);
  }

  _emitCrackle() {
    this.crackleTimer = null;
    if (!this.active) return;
    const ctx = this.audioCtx;
    const now = ctx.currentTime;

    // Single-shot noise → bandpass → quick envelope → crackleGain.
    const burst = createNoiseSource(ctx, 0.2);
    burst.loop = false;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000 + Math.random() * 4000;
    bp.Q.value = 1.5;
    const env = ctx.createGain();
    const attack = 0.001;
    const decay = 0.02 + Math.random() * 0.06;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.4, now + attack);
    env.gain.linearRampToValueAtTime(0, now + attack + decay);
    burst.connect(bp);
    bp.connect(env);
    env.connect(this.crackleGain);
    burst.start(now);
    burst.stop(now + attack + decay + 0.05);

    this._scheduleNextCrackle();
  }
}
