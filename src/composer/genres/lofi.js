// Lofi composer. Generates bars of MIDI events on three channels:
//   0  Rhodes / Electric Piano   — block-voiced chord on the downbeat (& 3)
//   1  Electric Bass             — root on 1, optionally 5th on 3
//   2  Vibraphone (optional lead) — only used when a lead provider is attached
//   9  Drum kit                  — boom-bap pattern from the rhythm library
//
// Composition strategy: pick a 4-bar progression with random transposition,
// loop it 2–3 times, then maybe rotate. Drum pattern is fixed within a
// cycle; the last bar of the final cycle gets a 40% chance of a fill. Slight
// per-bar humanisation keeps things from feeling locked.

import { buildChordContext } from '../theory.js';
import { pianoVoicing, bassRoot, bassFifth } from '../voicing.js';
import { LOFI_PATTERNS, LOFI_FILLS, drumEvents } from '../rhythm.js';
import { ProgressionCursor } from '../progression.js';
import { SectionPlanner } from '../section.js';
import { colorizeChord } from '../theory.js';

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
  // Second 16 — same conservative diatonic / mild-substitution vocabulary
  ['Cmaj7',  'G7',    'Am7',   'Fmaj7'], // I  V  vi IV (pop cycle)
  ['Am7',    'G7',    'Fmaj7', 'G7'   ], // vi V IV V (Andalusian-ish)
  ['Dm7',    'Db7',   'Cmaj7', 'Cmaj7'], // ii bII V→I (tritone sub of V)
  ['Cmaj7',  'Am7',   'Em7',   'G7'   ], // I  vi iii V
  ['Fmaj7',  'G7',    'Em7',   'Am7'  ], // IV V iii vi
  ['Am7',    'Em7',   'Fmaj7', 'G7'   ], // vi iii IV V
  ['Dm7',    'G7',    'Em7',   'Am7'  ], // ii V iii vi
  ['Cmaj7',  'Am7',   'Fmaj7', 'Dm7'  ], // I  vi IV ii
  ['Em7',    'A7',    'Dm7',   'G7'   ], // iii V/ii ii V
  ['Dm7',    'Em7',   'Am7',   'G7'   ], // ii iii vi V
  ['Cmaj7',  'C7',    'Fmaj7', 'Fm7'  ], // I V/IV IV iv (borrowed iv)
  ['Am7',    'D7',    'G7',    'Cmaj7'], // vi V/V V I (extended dominant chain)
  ['Cmaj7',  'Fm7',   'Cmaj7', 'G7'   ], // I iv I V (modal borrow)
  ['Am7',    'G7',    'Cmaj7', 'Fmaj7'], // vi V I IV
  ['Fmaj7',  'Cmaj7', 'Dm7',   'G7'   ], // IV I ii V (turnaround start)
  ['Cmaj7',  'Em7',   'Am7',   'Dm7'  ], // I iii vi ii (cycle of 4ths down)
];

const CH_PIANO = 0;
const CH_BASS  = 1;
const CH_LEAD  = 2;
const CH_DRUM  = 9;

// GM programs.
const PROG_PIANO = 4;   // Electric Piano 1 (Rhodes-ish)
const PROG_BASS  = 33;  // Electric Bass (finger)
const PROG_LEAD  = 11;  // Vibraphone — mallet attack + natural sustain, sits
                        // beautifully over the chord stabs. Chosen after A/B
                        // listening against EP, Marimba, Tubular Bells, and
                        // Pan Flute.

// 8th-note swing depth. ~0.09 of a beat lands the "and" of each beat just
// noticeably late — classic lofi shuffle, not full triplet feel.
const LOFI_SWING = 0.09;

// Piano comping templates. Picked weighted per bar so the right hand
// doesn't stamp the same "beat 1 + beat 3" forever. Each `hit` is a
// chord stab; `roll` arpeggiates the voicing across N beats per note
// instead of a block stab.
const LOFI_PIANO_PATTERNS = [
  // Default — chord stabs on the strong beats. Still the most common
  // shape so the genre is recognisable.
  { name: 'standard',     hits: [{ time: 0,    vel: 78 }, { time: 2,    vel: 70 }], weight: 40 },
  // Sparse — only the downbeat stab. Lets the bar breathe.
  { name: 'sparse',       hits: [{ time: 0,    vel: 78 }],                          weight: 12 },
  // Push — second stab anticipated half a beat early.
  { name: 'anticipation', hits: [{ time: 0,    vel: 78 }, { time: 1.5,  vel: 73 }], weight: 12 },
  // Lay-back — both stabs land just behind the beat.
  { name: 'layback',      hits: [{ time: 0.12, vel: 78 }, { time: 2.12, vel: 70 }], weight: 10 },
  // Off-beat — Charleston-ish, hits on 2 and 4 instead of 1 and 3.
  { name: 'off-beat',     hits: [{ time: 1,    vel: 74 }, { time: 3,    vel: 71 }], weight:  9 },
  // Roll-up — arpeggiate the voicing on beat 1, then a block stab on 3.
  { name: 'roll-up',      hits: [{ time: 0,    vel: 78, roll: 0.11 }, { time: 2,    vel: 70 }], weight:  9 },
  // Silent — piano sits out the whole bar. Bass + drums carry.
  { name: 'silent',       hits: [],                                                weight:  8 },
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pickWeighted(items) {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = Math.random() * total;
  for (const x of items) {
    r -= x.weight;
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

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
    // SectionPlanner — alternates verse/chorus density across a 16-bar
    // "song" so the arrangement has dynamic contrast.
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
      cyclesMin: 2,
      cyclesMax: 3,
      rotateChance: 0, // SectionPlanner controls when to rotate
      colorize: colorizeChord,
      // onCycleStart fires every cycle wrap — rotation OR same-progression
      // loop — so the drum pattern re-picks and the lead regenerates every
      // 4-bar cycle. Repeat-perception goes from "same drum for 8-12 bars"
      // down to "same drum for 4 bars".
      onCycleStart: (parsed) => {
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

    // SectionPlanner only gates the lead in/out — velocity stays flat
    // across sections. Earlier versions also scaled velocity by density,
    // which produced an audible "loud-quiet-loud" pulse that read as
    // distracting rather than musical for background listening.
    const d = this.section.current().density;

    const chord = this.cursor.current();
    const nextChord = this.cursor.next();
    const events = [];

    const isBreakdownBar = this.cursor.barInProg === this.breakdownBar;
    const dropPiano = isBreakdownBar && this.breakdownVoice === 'piano';
    const dropBass  = isBreakdownBar && this.breakdownVoice === 'bass';
    const dropDrums = isBreakdownBar && this.breakdownVoice === 'drums';

    // --- piano: pick a comping pattern this bar ---
    // Each pattern is a list of `hits` (chord stabs at specific beats).
    // A `roll` value spreads the voicing across that many beats per note
    // instead of stamping the chord as a single block.
    const voicing = pianoVoicing(chord, this.prevVoicing);
    this.prevVoicing = voicing;
    if (!dropPiano) {
      const compPattern = pickWeighted(LOFI_PIANO_PATTERNS);
      for (const hit of compPattern.hits) {
        const roll = hit.roll ?? 0;
        voicing.forEach((note, i) => {
          // roll > 0: arpeggiate voicing across `roll` beats per note.
          // roll = 0: block stab with a tiny human-feel jitter.
          const time = roll > 0
            ? hit.time + i * roll
            : hit.time + Math.random() * 0.02;
          events.push({
            channel: CH_PIANO,
            note,
            velocity: hit.vel + Math.floor(Math.random() * 6),
            time,
            duration: 1.9, // let it ring
          });
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
    // Only sound the lead on dense (chorus) sections. Verse stays silent
    // on the lead channel — that's the entire structural contrast now.
    if (this.lead && d >= 0.7) {
      // Vibraphone's bright/clear sweet spot: C4..A5. Going above A5 the
      // bars start to chime more than they sing.
      const ctx = buildChordContext(chord);
      ctx.leadRange = [60, 81];
      const leadNotes = this.lead.barNotes(ctx, this.cursor.barInProg);
      for (const n of leadNotes) {
        events.push({
          channel: CH_LEAD,
          note: n.pitch,
          velocity: n.velocity ?? 65,
          time: n.time,
          duration: n.duration,
        });
      }
    }

    this.cursor.advance();
    if (this.section.advance()) {
      // Full song template complete — rotate to a fresh progression / key.
      this.cursor.rotate();
    }
    return { bpm: this.bpm, beats: 4, events };
  }
}
