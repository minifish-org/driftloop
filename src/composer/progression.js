// ProgressionCursor — the rotation bookkeeping every genre composer
// duplicates. Owns: which progression we're on, what bar in it we're on,
// how many cycles we've completed, and when to rotate to a fresh one with
// a fresh transposition.
//
// The cursor doesn't know about chords, voicings, or rhythm. Composers
// stay in charge of how the chord at any cursor position maps to MIDI
// events. Callbacks let a composer add genre-specific side effects on
// rotation (e.g. pick a new drum pattern, notify the lead provider).

import { parseChord, transposeChord } from './theory.js';

function rint(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export class ProgressionCursor {
  constructor({
    progressions,           // array of arrays of chord symbol strings
    cyclesMin = 2,          // min cycles before considering a rotation
    cyclesMax = 3,          // max cycles before rotation MUST happen
    rotateChance = 0.7,     // P(rotate to a new progression) at cycle end
    barsPerChord = 1,       // ambient uses 2 — chord changes only every Nth bar
    onRotate = null,        // (parsed) => void, fires after a rotate()
  }) {
    this.progressions = progressions;
    this.cyclesMin = cyclesMin;
    this.cyclesMax = cyclesMax;
    this.rotateChance = rotateChance;
    this.barsPerChord = barsPerChord;
    this.onRotate = onRotate;
    this.parsed = null;
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 0;
  }

  // Pick a fresh progression + random transposition and reset counters.
  rotate() {
    const symbols = this.progressions[Math.floor(Math.random() * this.progressions.length)];
    const transpose = Math.floor(Math.random() * 12);
    this.parsed = symbols.map(s => transposeChord(parseChord(s), transpose));
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = rint(this.cyclesMin, this.cyclesMax);
    if (this.onRotate) this.onRotate(this.parsed);
  }

  get barsPerCycle() { return this.parsed.length * this.barsPerChord; }

  // Chord index at the current cursor position. Accounts for barsPerChord
  // so ambient (barsPerChord=2) holds each chord for 2 bars.
  _chordIdx() { return Math.floor(this.barInProg / this.barsPerChord) % this.parsed.length; }

  current() { return this.parsed[this._chordIdx()]; }
  next()    { return this.parsed[(this._chordIdx() + 1) % this.parsed.length]; }

  // True if this is the final bar of the final cycle before a rotation —
  // used by composers for end-of-section effects like drum fills.
  isFinalBarOfCycle() {
    return this.barInProg === this.barsPerCycle - 1 &&
           this.cyclesDone === this.cyclesTarget - 1;
  }

  // Returns true if this is the first bar of a new chord (every barsPerChord-th
  // bar). Useful for ambient where note-ons happen only on chord changes.
  isChordChangeBar() {
    return this.barInProg % this.barsPerChord === 0;
  }

  // Advance one bar. Triggers a rotation when we've finished cyclesTarget
  // full cycles (with rotateChance probability; otherwise just stays on
  // the same progression for another stretch).
  advance() {
    this.barInProg += 1;
    if (this.barInProg < this.barsPerCycle) return;
    this.barInProg = 0;
    this.cyclesDone += 1;
    if (this.cyclesDone < this.cyclesTarget) return;
    if (Math.random() < this.rotateChance) {
      this.rotate();
    } else {
      this.cyclesDone = 0;
      this.cyclesTarget = rint(this.cyclesMin, this.cyclesMax);
    }
  }
}
