// Jazz composer. Acoustic grand piano comping rootless 7th voicings on
// the off-beats, walking quarter-note acoustic-bass, ride-cymbal swing
// pattern with hat on 2 & 4. The unmistakable signals are the walking
// bass and the swung ride.

import { buildChord, intoRange, chordScale, buildChordContext, colorizeChord } from '../theory.js';
import { pianoVoicing } from '../voicing.js';
import { ProgressionCursor } from '../progression.js';
import { SectionPlanner } from '../section.js';

const PROGRESSIONS = [
  ['Dm7',   'G7',    'Cmaj7', 'Cmaj7'],
  ['Cmaj7', 'Am7',   'Dm7',   'G7'   ],
  ['Fmaj7', 'Bbmaj7','Em7',   'A7'   ],   // hint of chromatic ii-V
  ['Cmaj7', 'A7',    'Dm7',   'G7'   ],   // I-V/ii-ii-V (rhythm changes)
  ['Em7',   'A7',    'Dm7',   'G7'   ],
  ['Dm7',   'G7',    'Em7',   'A7'   ],
  ['Cmaj7', 'F7',    'Em7',   'A7'   ],   // jazz blues-ish
  ['Cmaj7', 'Ebm7',  'Dm7',   'G7'   ],   // chromatic approach
  ['Dm7',   'Db7',   'Cmaj7', 'Cmaj7'],   // tritone sub for G7
  ['Am7',   'D7',    'Gmaj7', 'Cmaj7'],   // ii-V to IV
  ['Cmaj7', 'C7',    'Fmaj7', 'Fm7'   ],  // borrowed iv minor
  ['Fmaj7', 'Dm7',   'G7',    'Cmaj7'],   // IV-ii-V-I
  ['Bm7b5', 'E7',    'Am7',   'D7'    ],  // minor ii-V then secondary
  ['Cmaj7', 'F7',    'Bbmaj7','A7'    ],  // circle-of-4ths down
  // Second 14 — more substitutions, chains, backdoors
  ['Dm7',   'G7',    'Em7',   'A7'   ],   // ii-V to vi (extended turnaround)
  ['Fm7',   'Bb7',   'Cmaj7', 'Cmaj7'],   // backdoor ii-V (iv-bVII-I)
  ['Cmaj7', 'F7',    'Cmaj7', 'G7'   ],   // I IV I V (major-key blues feel)
  ['Cmaj7', 'Eb7',   'Abmaj7','Db7'   ],  // Coltrane changes, simplified
  ['Cm7',   'F7',    'Bbmaj7','Bbmaj7'],  // i-IV-bVII (minor blues movement)
  ['Cmaj7', 'Am7',   'Dm7',   'G7'   ],   // I vi ii V (basic turnaround)
  ['Dm7',   'G7',    'Cmaj7', 'Fmaj7'],   // ii V I IV (turnaround → IV)
  ['Am7',   'D7',    'Dm7',   'G7'   ],   // vi V/V ii V (II7 as approach)
  ['Cmaj7', 'F#m7b5','B7',    'Em7'  ],   // chromatic descending mediant
  ['Cmaj7', 'F7',    'Bbmaj7','Eb7'  ],   // I IV down a step (cycle)
  ['Cmaj7', 'Bm7b5', 'E7',    'Am7'  ],   // I vii° V/vi vi
  ['Cmaj7', 'Cmaj7', 'F7',    'F7'   ],   // long pads (one chord per 2 bars)
  ['Cmaj7', 'D7',    'Dm7',   'G7'   ],   // I V/V ii V (Lydian II)
  ['Gm7',   'C7',    'Fmaj7', 'Fmaj7'],   // ii-V into IV (longer dwell)
];

const CH_PIANO = 0;
const CH_BASS  = 1;
const CH_LEAD  = 2;
const CH_DRUM  = 9;

const PROG_PIANO = 0;   // Acoustic Grand Piano
const PROG_BASS  = 32;  // Acoustic Bass (upright)
const PROG_LEAD  = 11;  // Vibraphone — Milt Jackson / Modern Jazz Quartet
                        // territory. Chosen after A/B against EP, Trumpet,
                        // Alto Sax, and Drawbar Organ — Vibes was the only
                        // option that didn't sound like a poor sample of
                        // a solo wind / brass voice in MS Gen Lite.

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Walking-bass step generator for one bar.
//   beat 1: chord root in low octave
//   beat 2: chord third (or fifth) in same range
//   beat 3: chord fifth (or root again)
//   beat 4: chromatic approach to NEXT chord's root (root±1)
function walkingBassBar(chord, nextChord) {
  const rootMidi = intoRange(chord.rootPc + 36, 36, 52);
  const thirdMidi = intoRange(chord.rootPc + 36 + buildChord(0, chord.quality)[1], 36, 52);
  const fifthMidi = intoRange(chord.rootPc + 36 + 7, 36, 52);
  const nextRoot = intoRange(nextChord.rootPc + 36, 36, 52);
  // approach: prefer descending half-step into next root if it's in-scale
  const scale = chordScale(chord);
  const candAbove = ((nextRoot - 1) + 12) % 12;
  const candBelow = ((nextRoot + 1)     ) % 12;
  let approach;
  if (scale.includes(candAbove % 12)) approach = nextRoot - 1;
  else if (scale.includes(candBelow % 12)) approach = nextRoot + 1;
  else approach = nextRoot - 1;
  approach = intoRange(approach, 36, 52);

  // Slight variation: 30% swap 3rd/5th order
  if (Math.random() < 0.3) {
    return [rootMidi, fifthMidi, thirdMidi, approach];
  }
  return [rootMidi, thirdMidi, fifthMidi, approach];
}

// Swing ride pattern + pedal hat on 2 & 4 + ghost snare.
// Swing-8th sits at 2/3 of the beat (triplet feel).
function swingDrumEvents() {
  const events = [];
  const ride = 51, hatPedal = 44, snare = 38;
  // Ride pattern: "ding . . ding . da ding . . ding . da" — hit on every
  // beat plus a swing-8th on beats 2 and 4 (the "lang" of spang-a-lang).
  const rideTimes = [0.0, 1.0, 1.667, 2.0, 3.0, 3.667];
  for (const t of rideTimes) {
    events.push({ channel: CH_DRUM, note: ride, velocity: 70 + Math.floor(Math.random() * 10), time: t, duration: 0.1 });
  }
  // Pedal hi-hat on 2 and 4 — the "chick"
  for (const t of [1.0, 3.0]) {
    events.push({ channel: CH_DRUM, note: hatPedal, velocity: 60, time: t, duration: 0.1 });
  }
  // Occasional ghost snare on the swing-8th of 1 or 3
  if (Math.random() < 0.5) {
    events.push({ channel: CH_DRUM, note: snare, velocity: 28, time: 0.667, duration: 0.1 });
  }
  if (Math.random() < 0.4) {
    events.push({ channel: CH_DRUM, note: snare, velocity: 28, time: 2.667, duration: 0.1 });
  }
  return events;
}

export class JazzComposer {
  constructor() {
    this.bpm = 130;
    this.lead = null;
    this.prevVoicing = null;
    this.breakdownBar = -1;
    this.breakdownVoice = null;
    this._breakdownCycleId = -1;
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
      rotateChance: 0, // SectionPlanner controls rotation
      colorize: colorizeChord,
      onCycleStart: (parsed) => {
        this._breakdownCycleId = -1;
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

  getSetup() {
    return [
      { channel: CH_PIANO, program: PROG_PIANO },
      { channel: CH_BASS,  program: PROG_BASS  },
      { channel: CH_LEAD,  program: PROG_LEAD  },
    ];
  }

  restart() {
    this.bpm = 115 + Math.floor(Math.random() * 31); // 115–145
    this.cursor.rotate();
  }

  nextBar(_barIndex) {
    if (!this.cursor.parsed) this.restart();

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

    // SectionPlanner only gates the lead in/out — velocity stays flat.
    const d = this.section.current().density;

    const chord = this.cursor.current();
    const nextChord = this.cursor.next();
    const events = [];

    const isBreakdownBar = this.cursor.barInProg === this.breakdownBar;
    const dropPiano = isBreakdownBar && this.breakdownVoice === 'piano';
    const dropBass  = isBreakdownBar && this.breakdownVoice === 'bass';
    const dropDrums = isBreakdownBar && this.breakdownVoice === 'drums';

    // Break-pulse: every bar has a small chance of departing from the
    // relentless walking-bass + spang-a-lang rhythm. Without this jazz
    // would feel monotonous even though the chords change — the whole
    // rhythmic skeleton stamps the same pattern bar after bar.
    //   stopTime (5%):  only beat 1 fires across all voices, then silence.
    //   dropBeat4 (8%): bass walks 3 notes, ride skips its beat-4 hit.
    const pulseRoll = Math.random();
    const stopTime  = pulseRoll < 0.05;
    const dropBeat4 = !stopTime && pulseRoll < 0.13;

    // Piano comping
    const voicing = pianoVoicing(chord, this.prevVoicing);
    this.prevVoicing = voicing;
    if (!dropPiano) {
      if (stopTime) {
        // Single chord stab on beat 1, then silence.
        for (const note of voicing) {
          events.push({
            channel: CH_PIANO,
            note,
            velocity: 70 + Math.floor(Math.random() * 6),
            time: 0,
            duration: 1.5,
          });
        }
      } else {
        // Charleston-ish comping: chord stabs on "and of 2" and "and of 4".
        const compTimes = Math.random() < 0.5 ? [1.667, 3.0]
                        : Math.random() < 0.5 ? [1.0, 2.667]
                        : [1.667, 3.667];
        for (const t of compTimes) {
          for (const note of voicing) {
            events.push({
              channel: CH_PIANO,
              note,
              velocity: 64 + Math.floor(Math.random() * 8),
              time: t,
              duration: 0.7,
            });
          }
        }
      }
    }

    // Walking bass: 4 quarter notes normally; fewer on a break-pulse bar.
    if (!dropBass) {
      const walk = walkingBassBar(chord, nextChord);
      const walkLen = stopTime ? 1 : (dropBeat4 ? 3 : 4);
      for (let i = 0; i < walkLen; i++) {
        events.push({
          channel: CH_BASS,
          note: walk[i],
          velocity: 84 + Math.floor(Math.random() * 6),
          time: i,
          duration: 0.85,
        });
      }
    }

    // Drums
    if (!dropDrums) {
      if (stopTime) {
        // Single ride hit on beat 1 (note 51 = Ride Cymbal 1) —
        // punctuates the silence that follows.
        events.push({ channel: CH_DRUM, note: 51, velocity: 78, time: 0, duration: 0.1 });
      } else {
        const drums = swingDrumEvents();
        // dropBeat4: lose the ride hit on beat 4 (and its swing-8th).
        const filtered = dropBeat4
          ? drums.filter(e => !(e.note === 51 && e.time >= 2.9))
          : drums;
        events.push(...filtered);
      }
    }

    // Lead (optional) — only on dense (chorus) sections.
    if (this.lead && d >= 0.7) {
      // Vibraphone's broader sweet spot — it reaches lower than the
      // lofi range thanks to its sustained mallet attack, and still
      // sings nicely up to A5.
      const ctx = buildChordContext(chord);
      ctx.leadRange = [55, 81];
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
    if (this.section.advance()) this.cursor.rotate();
    return { bpm: this.bpm, beats: 4, events };
  }
}
