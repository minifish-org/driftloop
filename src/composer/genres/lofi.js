// Lofi composer. Generates bars of MIDI events on three channels:
//   0  Rhodes / Electric Piano  — block-voiced chord on the downbeat (& 3)
//   1  Electric Bass            — root on 1, optionally 5th on 3
//   9  Drum kit                 — boom-bap pattern from the rhythm library
//
// Composition strategy is intentionally simple: pick a 4-bar progression,
// loop it 2–4 times, then maybe rotate to a different progression. Drum
// pattern is fixed within a progression cycle. Slight per-bar humanisation
// (velocity, optional 8th-note bass pickup into next bar) keeps things from
// feeling locked-in.

import { parseChord, chordScale } from '../theory.js';
import { pianoVoicing, bassRoot, bassFifth } from '../voicing.js';
import { LOFI_PATTERNS, drumEvents } from '../rhythm.js';

const PROGRESSIONS = [
  ['Cmaj7',  'Am7',   'Dm7',   'G7'   ], // I  vi  ii V
  ['Cmaj7',  'Fmaj7', 'Am7',   'Em7'  ], // I  IV  vi iii
  ['Dm7',    'G7',    'Cmaj7', 'Am7'  ], // ii V   I  vi
  ['Am7',    'Dm7',   'G7',    'Cmaj7'], // vi ii  V  I
  ['Fmaj7',  'Em7',   'Dm7',   'Cmaj7'], // IV iii ii I
  ['Cmaj7',  'Em7',   'Fmaj7', 'G7'   ], // I  iii IV V
  ['Am7',    'Fmaj7', 'Cmaj7', 'G7'   ], // vi IV  I  V  (very lofi)
  ['Em7',    'Am7',   'Dm7',   'G7'   ], // iii vi ii V
];

const CH_PIANO = 0;
const CH_BASS  = 1;
const CH_LEAD  = 2;
const CH_DRUM  = 9;

// GM programs.
const PROG_PIANO = 4;   // Electric Piano 1 (Rhodes-ish)
const PROG_BASS  = 33;  // Electric Bass (finger)
const PROG_LEAD  = 73;  // Flute — gentle single-line voice over the chords

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export class LofiComposer {
  constructor() {
    this.bpm = 76;
    this.progression = null;
    this.pattern = null;
    this.parsed = null;
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 0;
    this.lead = null; // LeadProvider | null
  }

  setLead(provider) {
    this.lead = provider;
    if (provider && this.parsed) {
      provider.startProgression?.(this.parsed, this.bpm);
    }
  }

  reset() {
    // 70–84 bpm — slow enough to feel lofi, fast enough to not drag.
    this.bpm = 70 + Math.floor(Math.random() * 15);
    this._rotate();
    return {
      setup: [
        { channel: CH_PIANO, program: PROG_PIANO },
        { channel: CH_BASS,  program: PROG_BASS  },
        { channel: CH_LEAD,  program: PROG_LEAD  },
        // CH_DRUM (9) is GM percussion — no program change needed
      ],
    };
  }

  _rotate() {
    this.progression = pickRandom(PROGRESSIONS);
    this.parsed = this.progression.map(parseChord);
    this.pattern = pickRandom(LOFI_PATTERNS);
    this.barInProg = 0;
    this.cyclesDone = 0;
    // Stay on a progression 2–3 cycles (8–12 bars) before considering a swap.
    this.cyclesTarget = 2 + Math.floor(Math.random() * 2);
    if (this.lead) this.lead.startProgression?.(this.parsed, this.bpm);
  }

  nextBar(barIndex) {
    if (!this.progression) this.reset();

    const chord = this.parsed[this.barInProg];
    const nextChord = this.parsed[(this.barInProg + 1) % this.parsed.length];

    const events = [];

    // --- piano: two block voicings per bar, on beat 1 and beat 3 ---
    const voicing = pianoVoicing(chord);
    for (const beatStart of [0, 2]) {
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
      // 8th-note pickup to next bar's root: play next-bar root, an octave up
      // from regular bass, on the & of beat 4 (time = 3.5).
      events.push({
        channel: CH_BASS,
        note: bassRoot(nextChord) + 7, // a 5th up of next root — neutral pickup
        velocity: 70,
        time: 3.5,
        duration: 0.4,
      });
    }

    // --- drums ---
    events.push(...drumEvents(this.pattern, CH_DRUM));

    // --- lead (optional) ---
    if (this.lead) {
      const scalePcs = chordScale(chord);
      const leadNotes = this.lead.barNotes(chord, scalePcs, this.barInProg);
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

    // Advance progression cursor.
    this.barInProg += 1;
    if (this.barInProg >= this.progression.length) {
      this.barInProg = 0;
      this.cyclesDone += 1;
      if (this.cyclesDone >= this.cyclesTarget) {
        // 70% rotate to a fresh progression/pattern, 30% just keep going.
        if (Math.random() < 0.7) {
          this._rotate();
        } else {
          this.cyclesDone = 0;
          this.cyclesTarget = 2 + Math.floor(Math.random() * 2);
        }
      }
    }

    return { bpm: this.bpm, beats: 4, events };
  }
}
