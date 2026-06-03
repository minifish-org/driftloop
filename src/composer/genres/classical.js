// Classical composer. Music-box arpeggios over a soft harp pad. No drums.
// Functional triadic harmony, mostly major keys.
//
// The journey here: started as Acoustic Grand + String Ensemble, then
// Acoustic Grand + New Age Pad after the strings sounded thin in
// MS Gen Lite, then Harpsichord + Harp going for Baroque solo keyboard.
// None of those quite landed. Now: Music Box + Harp. The aesthetic
// shifts from "Bach prelude" to "lullaby / music box" — which is a
// different genre identity from what "classical" literally implies, but
// it's the option where every voice is a simple plucked/pitched
// percussion sample that MS Gen Lite renders cleanly.

import { buildChord, intoRange } from '../theory.js';
import { ProgressionCursor } from '../progression.js';
import { SectionPlanner } from '../section.js';

// Progressions are bare triads — quality is implied (no 7th extensions,
// keeping it Common-Practice).
const PROGRESSIONS = [
  ['C',  'G',  'Am', 'Em', 'F',  'C',  'F',  'G' ], // Pachelbel
  ['C',  'Am', 'F',  'G'                          ], // simple cycle
  ['C',  'G',  'Am', 'F'                          ],
  ['Dm', 'A',  'Bb', 'F',  'Gm', 'Dm', 'Gm', 'A' ], // Vivaldi-flavoured
  ['F',  'C',  'Dm', 'Am', 'Bb', 'F',  'Bb', 'C' ],
  ['G',  'D',  'Em', 'Bm', 'C',  'G',  'C',  'D' ], // Pachelbel in G
  ['Am', 'F',  'C',  'G',  'Am', 'F',  'C',  'E' ], // minor with picardy
  ['Em', 'Am', 'D',  'G',  'C',  'F#dim','B', 'Em'], // Bach-style minor circle
  ['Dm', 'Gm', 'A',  'Dm', 'Bb', 'F',  'Gm', 'A' ], // dorian-ish minor
  ['C',  'F',  'G',  'C',  'F',  'G',  'Am', 'F' ], // hymn-like plagal feel
  ['Am', 'E',  'F',  'Dm', 'Bb', 'Am', 'E',  'Am'], // harmonic minor outline
  ['G',  'Em', 'C',  'D',  'G',  'Em', 'Am', 'D' ], // G major folk
];

const CH_PIANO   = 0;
const CH_PAD = 1;

const PROG_PIANO = 10;  // Music Box — bright pitched percussion, fairy-tale tone
const PROG_PAD   = 46;  // Orchestral Harp — plucked sustain behind the music box

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

// Pad: triadic sustain held for the full bar, mid-register.
function padBar(chord) {
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
    this.section = new SectionPlanner({
      template: [
        { type: 'verse',  bars: 4 },
        { type: 'chorus', bars: 4 },
        { type: 'verse',  bars: 4 },
        { type: 'chorus', bars: 4 },
      ],
    });
    this.cursor = new ProgressionCursor({
      progressions: PROGRESSIONS,
      cyclesMin: 1,
      cyclesMax: 2,
      rotateChance: 0, // SectionPlanner controls rotation
      onRotate: () => {
        this.arpPattern = pickRandom(ARP_PATTERNS);
      },
    });
  }

  // Classical doesn't take a lead — the arpeggios are already the
  // foreground line. Accept the call but ignore it.
  setLead(_provider) { /* no-op */ }

  getSetup() {
    return [
      { channel: CH_PIANO, program: PROG_PIANO },
      { channel: CH_PAD,   program: PROG_PAD   },
    ];
  }

  restart() {
    this.bpm = 84 + Math.floor(Math.random() * 26); // 84–109
    this.cursor.rotate();
  }

  nextBar(_barIndex) {
    if (!this.cursor.parsed) this.restart();

    // SectionPlanner only gates the harp in/out — velocity stays flat.
    const d = this.section.current().density;

    const chord = this.cursor.current();
    const events = [];

    // Music-box arpeggio: 8 eighth-notes per bar (beat units 0.0, 0.5, …, 3.5)
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

    // Harp pad: sustained triad for the full bar. Skipped on sparse
    // (verse) sections so verse is "music box alone", chorus is "music
    // box + harp" — the only arrangement contrast across sections.
    if (d >= 0.7) {
      for (const note of padBar(chord)) {
        events.push({
          channel: CH_PAD,
          note,
          velocity: 48,
          time: 0,
          duration: 3.9,
        });
      }
    }

    this.cursor.advance();
    if (this.section.advance()) this.cursor.rotate();
    return { bpm: this.bpm, beats: 4, events };
  }
}
