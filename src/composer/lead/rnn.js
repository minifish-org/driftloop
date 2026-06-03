// MelodyRNN lead. Lazy-loads Magenta.js + the Basic MelodyRNN checkpoint
// the first time it's used (skipping the cost when the user never opts in).
//
// At each progression rotation we generate ONE long melody covering the
// whole progression (N bars × 16 sixteenth-note steps), then partition
// it by bar. Per bar we snap each pitch to that bar's chord scale — the
// grammar guard called out by CLAUDE.md.

import { snapToScale } from '../theory.js';

const MAGENTA_URL = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1';
const CHECKPOINT  = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn';

let magentaLoaded = null;
function loadMagenta() {
  if (magentaLoaded) return magentaLoaded;
  magentaLoaded = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = MAGENTA_URL;
    s.onload = () => resolve(globalThis.mm);
    s.onerror = () => reject(new Error(`Failed to load ${MAGENTA_URL}`));
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
    if (bars.length) {
      const last = bars[bars.length - 1];
      if (last.length) this.lastPitchOfCache = last[last.length - 1].pitch;
    }
  }

  barNotes(_chord, scalePcs, barIdx) {
    if (!this.cache || barIdx >= this.cache.length) return [];
    const bar = this.cache[barIdx];
    const [lo, hi] = this.range;
    return bar.map(n => {
      let p = snapToScale(n.pitch, scalePcs);
      while (p < lo) p += 12;
      while (p > hi) p -= 12;
      return { ...n, pitch: p };
    });
  }
}
