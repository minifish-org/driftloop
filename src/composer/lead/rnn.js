// MelodyRNN lead. Lazy-loads Magenta.js + the Basic MelodyRNN checkpoint
// the first time it's used (skipping the cost when the user never opts in).
//
// At each progression rotation we generate ONE long melody covering the
// whole progression (N bars × 16 sixteenth-note steps), then partition
// it by bar. Per bar we snap each pitch to that bar's chord scale — the
// grammar guard called out by CLAUDE.md.

import { snapToChordOrScale } from '../theory.js';

const MAGENTA_URL = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1';
// SRI hash for the URL above. Generated with:
//   curl -sSL <url> | openssl dgst -sha384 -binary | openssl base64 -A
// If the version is bumped, this hash must be regenerated or the browser
// will refuse to execute the script.
const MAGENTA_INTEGRITY = 'sha384-eNedu+HVczAMF3JaSAb+Tk6zZnsSD+8h9dpG/RG2rtPqTR/LGUpGG0dEzf2y7F5e';
const CHECKPOINT  = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn';

let magentaLoaded = null;
function loadMagenta() {
  if (magentaLoaded) return magentaLoaded;
  magentaLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MAGENTA_URL;
    s.integrity = MAGENTA_INTEGRITY;
    s.crossOrigin = 'anonymous'; // required for SRI on cross-origin scripts
    s.onload = () => resolve(globalThis.mm);
    s.onerror = () => reject(new Error(`Failed to load ${MAGENTA_URL} (integrity check or network)`));
    document.head.appendChild(s);
  });
  return magentaLoaded;
}

export class RnnLead {
  constructor({
    range = [60, 84],
    temperature = 1.1,
    onStatus = () => {},
  } = {}) {
    this.range = range;
    this.temperature = temperature;
    this.onStatus = onStatus;
    this.model = null;
    this.modelReady = null;
    this.cache = null;
    this.activeKey = null;
    this.lastPitchOfCache = 67;
  }

  async ensureModel() {
    if (this.model) return;
    if (!this.modelReady) {
      this.modelReady = (async () => {
        this.onStatus('Loading Magenta.js…');
        const mm = await loadMagenta();
        this.onStatus('Loading MelodyRNN checkpoint…');
        const model = new mm.MusicRNN(CHECKPOINT);
        await model.initialize();
        this.model = model;
        this.onStatus('MelodyRNN ready.');
      })();
    }
    await this.modelReady;
  }

  // Kick off generation for the whole progression. Fire-and-forget — bars
  // played before generation completes will fall back to silence (caller
  // can decide; we just return [] from barNotes if cache isn't ready).
  startProgression(chords, _bpm) {
    const key = chords.map(c => `${c.rootPc}:${c.quality}`).join('|') + '@' + Math.random();
    this.activeKey = key;
    this.cache = null;
    this._generate(chords, key).catch(err => {
      console.error('MelodyRNN generation failed:', err);
      this.onStatus('MelodyRNN failed (see console).');
    });
  }

  async _generate(chords, key) {
    await this.ensureModel();
    if (this.activeKey !== key) return; // user moved on

    const totalSteps = chords.length * 16; // 16 sixteenth-steps per bar
    const seedPitch = this.lastPitchOfCache;
    const prime = {
      notes: [{ pitch: seedPitch, quantizedStartStep: 0, quantizedEndStep: 2 }],
      quantizationInfo: { stepsPerQuarter: 4 },
      totalQuantizedSteps: 2,
    };
    const cont = await this.model.continueSequence(prime, totalSteps, this.temperature);
    if (this.activeKey !== key) return;

    const bars = [];
    for (let b = 0; b < chords.length; b++) {
      const barStart = b * 16;
      const barEnd = barStart + 16;
      const barNotes = cont.notes
        .filter(n => n.quantizedStartStep >= barStart && n.quantizedStartStep < barEnd)
        .map(n => {
          const startBeats = (n.quantizedStartStep - barStart) / 4;
          const endStep = Math.min(n.quantizedEndStep ?? (n.quantizedStartStep + 2), barEnd);
          const dur = Math.max(0.25, (endStep - n.quantizedStartStep) / 4);
          return { pitch: n.pitch, time: startBeats, duration: dur, velocity: 82 };
        });
      bars.push(barNotes);
    }
    this.cache = bars;
    // Note: we do NOT update lastPitchOfCache here. The raw RNN pitches
    // can drift far out of scale; using them as a seed for the next
    // progression compounds the drift. barNotes() updates lastPitchOfCache
    // with the snapped/clamped pitch the listener actually hears instead.
  }

  // ctx: { chord, scale, chordTones } — built by the composer via
  // buildChordContext(). Lets the lead apply its grammar guard (chord
  // tone preferred, scale fallback) without re-deriving theory each bar.
  barNotes(ctx, barIdx) {
    if (!this.cache || barIdx >= this.cache.length) return [];
    const bar = this.cache[barIdx];
    const [lo, hi] = this.range;
    const snapped = bar.map(n => {
      let p = snapToChordOrScale(n.pitch, ctx.chordTones, ctx.scale);
      while (p < lo) p += 12;
      while (p > hi) p -= 12;
      return { ...n, pitch: p };
    });
    // Update the seed for the NEXT progression's generation to the actual
    // last pitch the listener will hear (post-snap, post-clamp), not the
    // raw RNN output that might be wildly out of scale.
    if (snapped.length) this.lastPitchOfCache = snapped[snapped.length - 1].pitch;
    return snapped;
  }
}
