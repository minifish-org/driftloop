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
    // Last bar's worth of snapped notes — used as the prime for the next
    // progression's continuation so the line keeps flowing across the
    // boundary instead of restarting from a fixed seed each time.
    this.primeTail = [];
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

    // Build prime from the previous bar's tail when we have one; otherwise
    // a default G4 quarter-note seed for cold starts.
    const primeNotes = this.primeTail
      .map(n => {
        const start = Math.max(0, Math.floor(n.time * 4));
        const end = Math.min(16, Math.ceil((n.time + n.duration) * 4));
        return {
          pitch: n.pitch,
          quantizedStartStep: start,
          quantizedEndStep: Math.max(start + 1, end),
        };
      })
      .filter(n => n.quantizedStartStep < 16);

    const prime = primeNotes.length > 0
      ? {
          notes: primeNotes,
          quantizationInfo: { stepsPerQuarter: 4 },
          totalQuantizedSteps: 16,
        }
      : {
          notes: [{ pitch: 67, quantizedStartStep: 0, quantizedEndStep: 2 }],
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
    // primeTail is populated by barNotes() with the snapped/clamped pitches
    // the listener actually hears — using raw RNN output here would compound
    // drift across rotations.
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
    // Capture this bar's snapped notes as the prime tail for the next
    // progression's generation — gives the line continuity across rotation
    // boundaries instead of restarting from a fixed seed.
    if (snapped.length > 0) this.primeTail = snapped;
    return snapped;
  }
}
