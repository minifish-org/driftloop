// Jazz composer. Acoustic grand piano comping rootless 7th voicings on
// the off-beats, walking quarter-note acoustic-bass, ride-cymbal swing
// pattern with hat on 2 & 4. The unmistakable signals are the walking
// bass and the swung ride.

import { parseChord, buildChord, intoRange, chordScale } from '../theory.js';

const PROGRESSIONS = [
  ['Dm7',   'G7',    'Cmaj7', 'Cmaj7'],
  ['Cmaj7', 'Am7',   'Dm7',   'G7'   ],
  ['Fmaj7', 'Bbmaj7','Em7',   'A7'   ],   // hint of chromatic ii-V
  ['Cmaj7', 'A7',    'Dm7',   'G7'   ],   // I-V/ii-ii-V (rhythm changes)
  ['Em7',   'A7',    'Dm7',   'G7'   ],
  ['Dm7',   'G7',    'Em7',   'A7'   ],
  ['Cmaj7', 'F7',    'Em7',   'A7'   ],   // jazz blues-ish
];

const CH_PIANO = 0;
const CH_BASS  = 1;
const CH_LEAD  = 2;
const CH_DRUM  = 9;

const PROG_PIANO = 0;   // Acoustic Grand Piano
const PROG_BASS  = 32;  // Acoustic Bass (upright)
const PROG_LEAD  = 66;  // Tenor Sax

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Rootless drop-2 voicing for piano comping. Built around C4.
function jazzPianoVoicing(chord) {
  const ints = buildChord(0, chord.quality).slice(1); // 3,5,7[,9]
  const pcs = ints.map(i => (chord.rootPc + i) % 12);
  // place all near C4..C5
  const notes = pcs.map(pc => {
    let n = pc + 60;
    while (n < 55) n += 12;
    while (n > 75) n -= 12;
    return n;
  });
  return Array.from(new Set(notes)).sort((a, b) => a - b);
}

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
    this.progression = null;
    this.parsed = null;
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 0;
    this.lead = null;
  }

  setLead(provider) {
    this.lead = provider;
    if (provider && this.parsed) {
      provider.startProgression?.(this.parsed, this.bpm);
    }
  }

  reset() {
    this.bpm = 115 + Math.floor(Math.random() * 31); // 115–145
    this._rotate();
    return {
      setup: [
        { channel: CH_PIANO, program: PROG_PIANO },
        { channel: CH_BASS,  program: PROG_BASS  },
        { channel: CH_LEAD,  program: PROG_LEAD  },
      ],
    };
  }

  _rotate() {
    this.progression = pickRandom(PROGRESSIONS);
    this.parsed = this.progression.map(parseChord);
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 2 + Math.floor(Math.random() * 2);
    if (this.lead) this.lead.startProgression?.(this.parsed, this.bpm);
  }

  nextBar(_barIndex) {
    if (!this.progression) this.reset();
    const chord = this.parsed[this.barInProg];
    const nextChord = this.parsed[(this.barInProg + 1) % this.parsed.length];
    const events = [];

    // Piano comping: chord stabs on "and of 2" and "and of 4" (Charleston-ish).
    const voicing = jazzPianoVoicing(chord);
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

    // Walking bass: 4 quarter notes
    const walk = walkingBassBar(chord, nextChord);
    for (let i = 0; i < 4; i++) {
      events.push({
        channel: CH_BASS,
        note: walk[i],
        velocity: 84 + Math.floor(Math.random() * 6),
        time: i,
        duration: 0.85,
      });
    }

    // Drums
    events.push(...swingDrumEvents());

    // Lead (optional)
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

    this.barInProg += 1;
    if (this.barInProg >= this.parsed.length) {
      this.barInProg = 0;
      this.cyclesDone += 1;
      if (this.cyclesDone >= this.cyclesTarget) {
        if (Math.random() < 0.7) this._rotate();
        else { this.cyclesDone = 0; this.cyclesTarget = 2 + Math.floor(Math.random() * 2); }
      }
    }

    return { bpm: this.bpm, beats: 4, events };
  }
}
