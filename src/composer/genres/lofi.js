// Lofi composer. Generates bars of MIDI events on three channels:
//   0  Rhodes / Electric Piano  — block-voiced chord on the downbeat (& 3)
//   1  Electric Bass            — root on 1, optionally 5th on 3
//   2  Flute (optional lead)    — only used when a lead provider is attached
//   9  Drum kit                 — boom-bap pattern from the rhythm library
//
// Composition strategy: pick a 4-bar progression with random transposition,
// loop it 2–3 times, then maybe rotate. Drum pattern is fixed within a
// cycle; the last bar of the final cycle gets a 40% chance of a fill. Slight
// per-bar humanisation keeps things from feeling locked.

import { buildChordContext } from '../theory.js';
import { pianoVoicing, bassRoot, bassFifth } from '../voicing.js';
import { LOFI_PATTERNS, LOFI_FILLS, drumEvents } from '../rhythm.js';
import { ProgressionCursor } from '../progression.js';

const PROGRESSIONS = [
  ['Cmaj7',  'Am7',   'Dm7',   'G7'   ], // I  vi  ii V
  ['Cmaj7',  'Fmaj7', 'Am7',   'Em7'  ], // I  IV  vi iii
  ['Dm7',    'G7',    'Cmaj7', 'Am7'  ], // ii V   I  vi
  ['Am7',    'Dm7',   'G7',    'Cmaj7'], // vi ii  V  I
  ['Fmaj7',  'Em7',   'Dm7',   'Cmaj7'], // IV iii ii I
  ['Cmaj7',  'Em7',   'Fmaj7', 'G7'   ], // I  iii IV V
  ['Am7',    'Fmaj7', 'Cmaj7', 'G7'   ], // vi IV  I  V  (very lofi)
  ['Em7',    'Am7',   'Dm7',   'G7'   ], // iii vi ii V
  ['Cmaj7',  'Bm7b5', 'Em7',   'Am7'  ], // descending fifths
  ['Fmaj7',  'Am7',   'Dm7',   'G7'   ], // IV vi ii V
  ['Cmaj7',  'Dm7',   'Em7',   'Fmaj7'], // diatonic ascent
  ['Am7',    'Em7',   'Fmaj7', 'Cmaj7'], // vi iii IV I
  ['Dm7',    'Em7',   'Fmaj7', 'G7'   ], // ii iii IV V
  ['Cmaj7',  'A7',    'Dm7',   'G7'   ], // I V/ii ii V (secondary dominant)
  ['Cmaj7',  'Am7',   'Fmaj7', 'G7'   ], // I vi IV V (50s pop)
  ['Em7',    'Fmaj7', 'Cmaj7', 'G7'   ], // iii IV I V
];

const CH_PIANO = 0;
const CH_BASS  = 1;
const CH_LEAD  = 2;
const CH_DRUM  = 9;

// GM programs.
const PROG_PIANO = 4;   // Electric Piano 1 (Rhodes-ish)
const PROG_BASS  = 33;  // Electric Bass (finger)
const PROG_LEAD  = 73;  // Flute — gentle single-line voice over the chords

// 8th-note swing depth. ~0.09 of a beat lands the "and" of each beat just
// noticeably late — classic lofi shuffle, not full triplet feel.
const LOFI_SWING = 0.09;

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export class LofiComposer {
  constructor() {
    this.bpm = 76;
    this.pattern = null;
    this.lead = null;
    this.prevVoicing = null; // last piano voicing, for voice-leading
    // Macro dynamics: each cycle may have one "breakdown" bar where one
    // voice drops out for a beat of breath. Set per-cycle in nextBar.
    this.breakdownBar = -1;
    this.breakdownVoice = null;
    this._breakdownCycleId = -1;
    this.cursor = new ProgressionCursor({
      progressions: PROGRESSIONS,
      cyclesMin: 2,
      cyclesMax: 3,
      onRotate: (parsed) => {
        this.pattern = pickRandom(LOFI_PATTERNS);
        this._breakdownCycleId = -1; // force re-pick next bar
        if (this.lead) this.lead.startProgression?.(parsed, this.bpm);
      },
    });
  }

  setLead(provider) {
    this.lead = provider;
    if (provider && this.cursor.parsed) {
      provider.startProgression?.(this.cursor.parsed, this.bpm);
    }
  }

  // Pure declaration of which channels this composer drives. Scheduler
  // sends the program_change MIDI messages.
  getSetup() {
    return [
      { channel: CH_PIANO, program: PROG_PIANO },
      { channel: CH_BASS,  program: PROG_BASS  },
      { channel: CH_LEAD,  program: PROG_LEAD  },
      // CH_DRUM (9) is GM percussion — no program change needed
    ];
  }

  // Re-seed: randomize BPM, rotate to a fresh progression. Side effects only.
  restart() {
    // 70–84 bpm — slow enough to feel lofi, fast enough to not drag.
    this.bpm = 70 + Math.floor(Math.random() * 15);
    this.cursor.rotate();
  }

  nextBar(_barIndex) {
    if (!this.cursor.parsed) this.restart();

    // On every new cycle, decide whether to drop a voice for one bar.
    if (this._breakdownCycleId !== this.cursor.cyclesDone) {
      this._breakdownCycleId = this.cursor.cyclesDone;
      if (Math.random() < 0.35 && this.cursor.parsed.length > 1) {
        this.breakdownBar = 1 + Math.floor(Math.random() * (this.cursor.parsed.length - 1));
        this.breakdownVoice = pickRandom(['piano', 'bass', 'drums']);
      } else {
        this.breakdownBar = -1;
        this.breakdownVoice = null;
      }
    }

    const chord = this.cursor.current();
    const nextChord = this.cursor.next();
    const events = [];

    const isBreakdownBar = this.cursor.barInProg === this.breakdownBar;
    const dropPiano = isBreakdownBar && this.breakdownVoice === 'piano';
    const dropBass  = isBreakdownBar && this.breakdownVoice === 'bass';
    const dropDrums = isBreakdownBar && this.breakdownVoice === 'drums';

    // --- piano: two block voicings per bar, on beat 1 and beat 3 ---
    const voicing = pianoVoicing(chord, this.prevVoicing);
    this.prevVoicing = voicing;
    if (!dropPiano) for (const beatStart of [0, 2]) {
      // tiny velocity dip on the &-of-3 hit so beat 1 feels heaviest
      const vel = beatStart === 0 ? 78 : 70;
      for (const note of voicing) {
        events.push({
          channel: CH_PIANO,
          note,
          velocity: vel + Math.floor(Math.random() * 6),
          time: beatStart + (Math.random() * 0.02), // tiny human-shift
          duration: 1.9, // let it ring into the next half-bar
        });
      }
    }

    // --- bass: root on 1, occasionally 5th on 3, occasional pickup on 4& ---
    if (!dropBass) {
      events.push({
        channel: CH_BASS,
        note: bassRoot(chord),
        velocity: 86,
        time: 0,
        duration: 1.9,
      });
      if (Math.random() < 0.55) {
        events.push({
          channel: CH_BASS,
          note: Math.random() < 0.5 ? bassFifth(chord) : bassRoot(chord),
          velocity: 80,
          time: 2,
          duration: 1.6,
        });
      }
      if (Math.random() < 0.25) {
        // 8th-note pickup into next bar. We play the 5th of the NEXT chord
        // an octave above the usual bass register — a soft "lift" that leads
        // the ear into the downbeat without doubling the upcoming root.
        events.push({
          channel: CH_BASS,
          note: bassFifth(nextChord) + 12,
          velocity: 70,
          time: 3.5,
          duration: 0.4,
        });
      }
    }

    // --- drums ---
    // On the last bar of the very last cycle of a progression, 40% chance
    // to use a fill instead of the regular pattern — breaks the loop right
    // before we rotate to a new key/progression.
    if (!dropDrums) {
      const drumPattern =
        this.cursor.isFinalBarOfCycle() && Math.random() < 0.4
          ? pickRandom(LOFI_FILLS)
          : this.pattern;
      events.push(...drumEvents(drumPattern, CH_DRUM, LOFI_SWING));
    }

    // --- lead (optional) ---
    if (this.lead) {
      const ctx = buildChordContext(chord);
      const leadNotes = this.lead.barNotes(ctx, this.cursor.barInProg);
      for (const n of leadNotes) {
        events.push({
          channel: CH_LEAD,
          note: n.pitch,
          velocity: n.velocity ?? 82,
          time: n.time,
          duration: n.duration,
        });
      }
    }

    this.cursor.advance();
    return { bpm: this.bpm, beats: 4, events };
  }
}
