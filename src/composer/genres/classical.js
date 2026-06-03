// Classical composer. A Bach-prelude-style sixteenth-note arpeggio on
// acoustic piano, with a string-ensemble pad sustaining the harmony
// underneath. No drums. Functional triadic harmony, mostly major keys.

import { buildChord, intoRange } from '../theory.js';
import { ProgressionCursor } from '../progression.js';

// Progressions are bare triads — quality is implied (no 7th extensions,
// keeping it Common-Practice).
const PROGRESSIONS = [
  ['C',  'G',  'Am', 'Em', 'F',  'C',  'F',  'G' ], // Pachelbel
  ['C',  'Am', 'F',  'G'                          ], // simple cycle
  ['C',  'G',  'Am', 'F'                          ],
  ['Dm', 'A',  'Bb', 'F',  'Gm', 'Dm', 'Gm', 'A' ], // Vivaldi-flavoured
  ['F',  'C',  'Dm', 'Am', 'Bb', 'F',  'Bb', 'C' ],
  ['G',  'D',  'Em', 'Bm', 'C',  'G',  'C',  'D' ], // Pachelbel in G
];

const CH_PIANO   = 0;
const CH_STRINGS = 1;

const PROG_PIANO   = 0;  // Acoustic Grand Piano
const PROG_STRINGS = 48; // String Ensemble 1

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Build a triadic arpeggio: root, third, fifth, third (low to mid),
// repeated to fill 4 beats of 8th notes (8 hits). Octave parked at C3..C4.
function arpeggioBar(chord, pattern) {
  const ints = buildChord(0, chord.quality);
  // chord triad pitches in the C3-C4 octave
  const root  = intoRange(chord.rootPc + 48, 48, 60);
  const third = intoRange(chord.rootPc + 48 + ints[1], 48, 64);
  const fifth = intoRange(chord.rootPc + 48 + 7, 48, 64);
  const rootUp = root + 12;

  // pattern is an array of indices into [root, third, fifth, rootUp]
  const palette = [root, third, fifth, rootUp];
  return pattern.map(i => palette[i]);
}

// Three common Baroque arpeggio shapes. Each is 8 indices → 8 eighth notes.
const ARP_PATTERNS = [
  [0, 1, 2, 3, 2, 1, 2, 1],  // root-third-fifth-root↑-fifth-third-fifth-third
  [0, 2, 1, 2, 0, 2, 1, 2],  // Alberti-ish
  [0, 1, 2, 1, 0, 1, 2, 1],  // gentle waver
  [0, 1, 2, 3, 0, 1, 2, 3],  // straight ascending repeat
];

// Strings: triadic sustain held for the full bar, mid-register.
function stringsBar(chord) {
  const ints = buildChord(0, chord.quality);
  const r = intoRange(chord.rootPc + 60, 60, 72);   // C4..C5
  const t = intoRange(chord.rootPc + 60 + ints[1], 60, 75);
  const f = intoRange(chord.rootPc + 60 + 7, 60, 75);
  return [r, t, f];
}

export class ClassicalComposer {
  constructor() {
    this.bpm = 96;
    this.arpPattern = null;
    this.cursor = new ProgressionCursor({
      progressions: PROGRESSIONS,
      cyclesMin: 1,
      cyclesMax: 2,
      onRotate: () => {
        this.arpPattern = pickRandom(ARP_PATTERNS);
      },
    });
  }

  // Classical doesn't take a lead — the arpeggios are already the
  // foreground line. Accept the call but ignore it.
  setLead(_provider) { /* no-op */ }

  reset() {
    this.bpm = 84 + Math.floor(Math.random() * 26); // 84–109
    this.cursor.rotate();
    return {
      setup: [
        { channel: CH_PIANO,   program: PROG_PIANO   },
        { channel: CH_STRINGS, program: PROG_STRINGS },
      ],
    };
  }

  nextBar(_barIndex) {
    if (!this.cursor.parsed) this.reset();
    const chord = this.cursor.current();
    const events = [];

    // Piano arpeggio: 8 eighth-notes per bar (beat units 0.0, 0.5, 1.0, …, 3.5)
    const notes = arpeggioBar(chord, this.arpPattern);
    for (let i = 0; i < 8; i++) {
      events.push({
        channel: CH_PIANO,
        note: notes[i],
        velocity: 64 + Math.floor(Math.random() * 8),
        time: i * 0.5,
        duration: 0.5,
      });
    }

    // Strings: sustained triad for the full bar (4 beats), very soft.
    for (const note of stringsBar(chord)) {
      events.push({
        channel: CH_STRINGS,
        note,
        velocity: 48,
        time: 0,
        duration: 3.9,
      });
    }

    this.cursor.advance();
    return { bpm: this.bpm, beats: 4, events };
  }
}
