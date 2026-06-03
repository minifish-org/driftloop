// MelodyRNN lead, ImprovRNN flavour. Lazy-loads Magenta.js + the
// chord_pitches_improv checkpoint the first time it's used.
//
// ImprovRNN is the chord-conditioned cousin of Basic MelodyRNN: same size
// (~5 MB), same API shape, but it takes a chord-per-step argument and
// learns to follow the harmony natively. The output is in-key by
// construction, so the original two-stage grammar-guard snap is no longer
// load-bearing — we keep a soft range clamp (lo/hi) and trust the model
// for everything else.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Driftloop's internal quality enum → Magenta chord-symbol suffix.
// Magenta's chord parser accepts standard pop/jazz notation; map to what
// it understands. Anything missing falls back to the bare letter (= major).
const QUALITY_TO_MAGENTA = {
  'maj':    '',
  'min':    'm',
  'dim':    'dim',
  'aug':    'aug',
  'maj7':   'maj7',
  'min7':   'm7',
  'dom7':   '7',
  'min7b5': 'm7b5',
  'dim7':   'dim7',
  'maj9':   'maj9',
  'min9':   'm9',
  'dom9':   '9',
};

function chordToMagentaSymbol(chord) {
  const name = NOTE_NAMES[chord.rootPc];
  const suffix = QUALITY_TO_MAGENTA[chord.quality] ?? '';
  return name + suffix;
}

const MAGENTA_URL = 'https://cdn.jsdelivr.net/npm/@magenta/music@1.23.1';
// SRI hash for the URL above. Generated with:
//   curl -sSL <url> | openssl dgst -sha384 -binary | openssl base64 -A
// If the version is bumped, this hash must be regenerated or the browser
// will refuse to execute the script.
const MAGENTA_INTEGRITY = 'sha384-eNedu+HVczAMF3JaSAb+Tk6zZnsSD+8h9dpG/RG2rtPqTR/LGUpGG0dEzf2y7F5e';
const CHECKPOINT = 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/chord_pitches_improv';

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
    // Last bar's notes — used as prime for the next progression's
    // continuation so the line keeps flowing across the boundary.
    this.primeTail = [];
  }

  async ensureModel() {
    if (this.model) return;
    if (!this.modelReady) {
      this.modelReady = (async () => {
        this.onStatus('Loading Magenta.js…');
        const mm = await loadMagenta();
        this.onStatus('Loading ImprovRNN checkpoint…');
        const model = new mm.MusicRNN(CHECKPOINT);
        await model.initialize();
        this.model = model;
        this.onStatus('ImprovRNN ready.');
      })();
    }
    await this.modelReady;
  }

  // Kick off generation for the whole progression. Fire-and-forget — bars
  // played before generation completes return [] from barNotes (silent).
  startProgression(chords, _bpm) {
    const key = chords.map(c => `${c.rootPc}:${c.quality}`).join('|') + '@' + Math.random();
    this.activeKey = key;
    this.cache = null;
    this._generate(chords, key).catch(err => {
      console.error('ImprovRNN generation failed:', err);
      this.onStatus('ImprovRNN failed (see console).');
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

    // ImprovRNN expects one chord symbol per output step. Each bar gets
    // its chord replicated across all 16 steps of the bar.
    const chordProgression = [];
    for (const chord of chords) {
      const sym = chordToMagentaSymbol(chord);
      for (let i = 0; i < 16; i++) chordProgression.push(sym);
    }

    const cont = await this.model.continueSequence(
      prime,
      totalSteps,
      this.temperature,
      chordProgression,
    );
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
  }

  // ctx: { chord, scale, chordTones } — accepted for backwards compatibility
  // with the leadContext shape, but only `range` is used here. ImprovRNN
  // outputs in-key by construction; we just clamp to the lead's register.
  barNotes(_ctx, barIdx) {
    if (!this.cache || barIdx >= this.cache.length) return [];
    const bar = this.cache[barIdx];
    const [lo, hi] = this.range;
    const clamped = bar.map(n => {
      let p = n.pitch;
      while (p < lo) p += 12;
      while (p > hi) p -= 12;
      return { ...n, pitch: p };
    });
    // Stash the bar as prime tail for the next progression's generation.
    if (clamped.length > 0) this.primeTail = clamped;
    return clamped;
  }
}
