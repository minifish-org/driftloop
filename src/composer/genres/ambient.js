// Ambient composer. Two warm pads + a sparse glockenspiel top, no drums,
// slow harmonic motion (chord change once every 2 bars via the cursor's
// barsPerChord=2). The defining signal is long sustains with no rhythmic
// pulse — the ear identifies the genre instantly.

import { buildChord, intoRange } from '../theory.js';
import { ProgressionCursor } from '../progression.js';

const PROGRESSIONS = [
  ['Cmaj9',  'Fmaj9' ],                          // 2-chord drone
  ['Am9',    'Fmaj9', 'Cmaj9',  'Gmaj7'],
  ['Em9',    'Cmaj9', 'Gmaj7',  'Dmaj7'],
  ['Fmaj9',  'Cmaj9', 'Gmaj7',  'Am9'  ],
  ['Cmaj9',  'Am9'                       ],      // i-vi
  ['Dmaj7',  'Amaj7', 'Emaj7',  'Bmaj7'],        // bright modal
  ['Cmaj9',  'Gmaj7', 'Dmaj9',  'Amaj9'],        // bright cycle up
  ['Am9',    'Em9'                       ],      // minor drone pair
  ['Fmaj7',  'Bbmaj7'                    ],      // perfect-4th cycle
  ['Cmaj9',  'Ebmaj9','Gmaj9' ],                 // chromatic mediants
  // Second 8 — more modal / extended drones
  ['Bbmaj9', 'Fmaj9'                     ],      // bVII-IV drone (mixolydian)
  ['Em9',    'Dm9'                       ],      // dorian descent
  ['Cmaj9',  'Bm7b5', 'Em9'              ],      // tense-resolve in C
  ['Dmaj9',  'Amaj9', 'Emaj9',  'Bmaj9'],        // bright cycle up (4-chord)
  ['Fmaj9',  'Cmaj9', 'Dm9'              ],      // IV-I-ii (suspended)
  ['Cmaj9',  'Gmaj9', 'Dmaj9'            ],      // I-V-II (modulating up)
  ['Em9',    'Cmaj9', 'Am9'              ],      // iii-I-vi
  ['Fmaj9',  'Gmaj9'                     ],      // whole-step shift
];

const CH_PAD_LOW  = 0;
const CH_PAD_HIGH = 1;
const CH_CHIME    = 2;
const CH_DRONE    = 3;

// 89 = Pad 2 (Warm), 92 = Pad 5 (Bowed glass) — both very slow attack/release.
// 9  = Glockenspiel — clear bell-like single hits as a sparse top layer.
// 88 = Pad 1 (New Age) — slow sustained tone, used here as a sub-anchor
//      drone on the progression's tonic. Holds for one full cycle, so the
//      pads have a fixed harmonic floor to wash against.
const PROG_PAD_LOW  = 89;
const PROG_PAD_HIGH = 92;
const PROG_CHIME    = 9;
const PROG_DRONE    = 88;

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
    this.cursor = new ProgressionCursor({
      progressions: PROGRESSIONS,
      cyclesMin: 1,
      cyclesMax: 2,
      barsPerChord: 2, // each chord rings for two full bars
    });
  }

  // Ambient doesn't support a lead voice — the pads ARE the texture.
  // Accept and ignore the setting so the UI can drive a single API.
  setLead(_provider) { /* no-op */ }

  getSetup() {
    return [
      { channel: CH_PAD_LOW,  program: PROG_PAD_LOW  },
      { channel: CH_PAD_HIGH, program: PROG_PAD_HIGH },
      { channel: CH_CHIME,    program: PROG_CHIME    },
      { channel: CH_DRONE,    program: PROG_DRONE    },
    ];
  }

  restart() {
    // 50–68 bpm. Pace barely matters since chords last 2 bars, but lower
    // bpm gives the scheduler more time per bar.
    this.bpm = 50 + Math.floor(Math.random() * 19);
    this.cursor.rotate();
  }

  nextBar(_barIndex) {
    if (!this.cursor.parsed) this.restart();
    const chord = this.cursor.current();
    const events = [];

    // Drone: on the first bar of each cycle, sound the tonic root of the
    // progression for the full cycle (re-triggers on every cycle wrap and
    // every rotation). Sub-bass register so it anchors without competing
    // with the pad voicings above.
    if (this.cursor.barInProg === 0) {
      const tonicPc = this.cursor.parsed[0].rootPc;
      const dronePitch = intoRange(tonicPc + 33, 30, 42); // ~F#1..F#2
      const cycleBeats = this.cursor.barsPerCycle * 4;
      events.push({
        channel: CH_DRONE,
        note: dronePitch,
        velocity: 58,
        time: 0,
        duration: cycleBeats - 0.1, // tiny tail-trim so re-trigger doesn't overlap
      });
    }

    // Only emit fresh pad note-ons on the first bar of each chord — the
    // notes already scheduled there ring for the whole 2-bar span.
    if (this.cursor.isChordChangeBar()) {
      const dur = 8.0; // pads naturally cross-fade across 2-bar boundaries
      for (const note of padLowVoicing(chord)) {
        events.push({ channel: CH_PAD_LOW,  note, velocity: 70, time: 0.0, duration: dur });
      }
      for (const note of padHighVoicing(chord)) {
        events.push({ channel: CH_PAD_HIGH, note, velocity: 62, time: 0.05, duration: dur });
      }
    }

    // Sparse glockenspiel top layer — one bell every other bar on average,
    // landing on an off-beat so it doesn't feel meter-aligned. Picks a
    // chord tone in C5..C6 so it sings clearly above the pads.
    if (Math.random() < 0.45) {
      const ints = buildChord(0, chord.quality);
      const tone = ints[1 + Math.floor(Math.random() * (ints.length - 1))]; // 3rd / 5th / 7th
      const pitch = intoRange(chord.rootPc + 60 + tone, 72, 88);
      const startTime = 1 + Math.random() * 2.5; // beat 1.0 .. 3.5
      events.push({
        channel: CH_CHIME,
        note: pitch,
        velocity: 48 + Math.floor(Math.random() * 10),
        time: startTime,
        duration: 3.0, // let it ring
      });
    }

    this.cursor.advance();
    return { bpm: this.bpm, beats: 4, events };
  }
}
