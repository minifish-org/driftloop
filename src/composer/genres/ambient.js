// Ambient composer. Two warm pads, no drums, slow harmonic motion
// (chord change once every 2 bars). The defining signal is a long sustain
// with no rhythmic pulse — that's how the ear identifies the genre.

import { parseChord, buildChord, intoRange } from '../theory.js';

const PROGRESSIONS = [
  ['Cmaj9',  'Fmaj9' ],                          // 2-chord drone
  ['Am9',    'Fmaj9', 'Cmaj9',  'Gmaj7'],
  ['Em9',    'Cmaj9', 'Gmaj7',  'Dmaj7'],
  ['Fmaj9',  'Cmaj9', 'Gmaj7',  'Am9'  ],
  ['Cmaj9',  'Am9'                       ],      // i-vi
  ['Dmaj7',  'Amaj7', 'Emaj7',  'Bmaj7'],        // bright modal
];

const CH_PAD_LOW  = 0;
const CH_PAD_HIGH = 1;

// 89 = Pad 2 (Warm), 92 = Pad 5 (Bowed glass) — both very slow attack/release.
const PROG_PAD_LOW  = 89;
const PROG_PAD_HIGH = 92;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Pad low voice: root + 5th in low octave, very long sustain.
function padLowVoicing(chord) {
  const root  = intoRange(chord.rootPc + 24, 36, 52); // C2..E3
  const fifth = intoRange(chord.rootPc + 24 + 7, 36, 52);
  return [root, fifth];
}

// Pad high voice: 3rd + 7th + 9th (rootless upper structure) around C4..C5.
function padHighVoicing(chord) {
  const tones = buildChord(0, chord.quality);
  const upper = tones.slice(1).map(i => chord.rootPc + i + 48);
  return upper.map(n => intoRange(n, 60, 80));
}

export class AmbientComposer {
  constructor() {
    this.bpm = 60;
    this.progression = null;
    this.parsed = null;
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 0;
  }

  // Ambient doesn't support a lead voice — the pads ARE the texture.
  // Accept and ignore the setting so the UI can drive a single API.
  setLead(_provider) { /* no-op */ }

  reset() {
    // 50–68 bpm. Pace barely matters since chords last 2 bars, but lower
    // bpm gives the scheduler more time per bar.
    this.bpm = 50 + Math.floor(Math.random() * 19);
    this._rotate();
    return {
      setup: [
        { channel: CH_PAD_LOW,  program: PROG_PAD_LOW  },
        { channel: CH_PAD_HIGH, program: PROG_PAD_HIGH },
      ],
    };
  }

  _rotate() {
    this.progression = pickRandom(PROGRESSIONS);
    this.parsed = this.progression.map(parseChord);
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 1 + Math.floor(Math.random() * 2);
  }

  nextBar(_barIndex) {
    if (!this.progression) this.reset();

    // Each chord spans TWO bars. Use barInProg as the slow cursor (one
    // step per bar), but only emit fresh note-ons on even bars; odd bars
    // are "silent" (notes still ringing from the previous bar's downbeat).
    const chordIdx = Math.floor(this.barInProg / 2) % this.parsed.length;
    const chord = this.parsed[chordIdx];
    const events = [];

    if (this.barInProg % 2 === 0) {
      // ring through two full bars (8 beats) — pads naturally cross-fade.
      const dur = 8.0;
      for (const note of padLowVoicing(chord)) {
        events.push({ channel: CH_PAD_LOW,  note, velocity: 70, time: 0.0, duration: dur });
      }
      for (const note of padHighVoicing(chord)) {
        events.push({ channel: CH_PAD_HIGH, note, velocity: 62, time: 0.05, duration: dur });
      }
    }

    this.barInProg += 1;
    // Each progression is N chords × 2 bars. End of a full cycle:
    if (this.barInProg >= this.parsed.length * 2) {
      this.barInProg = 0;
      this.cyclesDone += 1;
      if (this.cyclesDone >= this.cyclesTarget) {
        if (Math.random() < 0.7) this._rotate();
        else { this.cyclesDone = 0; this.cyclesTarget = 1 + Math.floor(Math.random() * 2); }
      }
    }

    return { bpm: this.bpm, beats: 4, events };
  }
}
