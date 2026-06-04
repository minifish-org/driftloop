// ProgressionCursor — the rotation bookkeeping every genre composer
// duplicates. Owns: which progression we're on, what bar in it we're on,
// how many cycles we've completed, and when to rotate to a fresh one with
// a fresh transposition.
//
// The cursor doesn't know about chords, voicings, or rhythm. Composers
// stay in charge of how the chord at any cursor position maps to MIDI
// events. A single callback (onCycleStart) fires every time the cursor
// resets to bar 0 — whether that was a rotation (new progression + new
// key) or just the same progression looping for another cycle. This
// lets composers re-pick a drum pattern and regenerate a fresh lead
// every cycle rather than every rotation; same progression listened
// twice in a row no longer feels identical.

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
    colorize = null,        // optional (chord) => chord, applied per-chord
                            // after parsing. Lets composers nudge a Cmaj7
                            // into a Cmaj9 randomly so the same progression
                            // sounds slightly different each cycle.
    onCycleStart = null,    // (parsed) => void, fires on every cycle boundary
                            // (rotation OR same-progression wrap)
  }) {
    this.progressions = progressions;
    this.cyclesMin = cyclesMin;
    this.cyclesMax = cyclesMax;
    this.rotateChance = rotateChance;
    this.barsPerChord = barsPerChord;
    this.colorize = colorize;
    this.onCycleStart = onCycleStart;
    this.parsed = null;
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = 0;
  }

  // Pick a fresh progression + random transposition and reset counters.
  rotate() {
    const symbols = this.progressions[Math.floor(Math.random() * this.progressions.length)];
    const transpose = Math.floor(Math.random() * 12);
    let parsed = symbols.map(s => transposeChord(parseChord(s), transpose));
    if (this.colorize) parsed = parsed.map(this.colorize);
    this.parsed = parsed;
    this.barInProg = 0;
    this.cyclesDone = 0;
    this.cyclesTarget = rint(this.cyclesMin, this.cyclesMax);
    if (this.onCycleStart) this.onCycleStart(this.parsed);
  }

  // Re-colorize the current progression in place — used to refresh the
  // chord palette on a non-rotation cycle wrap so the second pass
  // through the same progression has different extensions.
  _recolorize() {
    if (!this.colorize || !this.parsed) return;
    // Re-apply colorize but using the original quality as the "neutral"
    // form. We don't have the originals cached; instead, simulate by
    // walking parsed and "decolouring" any maj9/min9/dom9 back to their
    // 7-version before recolourising. That way colorize is idempotent
    // across cycles.
    const decolor = { maj9: 'maj7', min9: 'min7', dom9: 'dom7' };
    this.parsed = this.parsed.map(c => {
      const base = decolor[c.quality]
        ? { rootPc: c.rootPc, quality: decolor[c.quality] }
        : c;
      return this.colorize(base);
    });
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
  // the same progression for another stretch). Every cycle boundary
  // — rotation or wrap — fires onCycleStart so composers can re-pick
  // their drum pattern and regenerate the lead.
  advance() {
    this.barInProg += 1;
    if (this.barInProg < this.barsPerCycle) return;
    this.barInProg = 0;
    this.cyclesDone += 1;
    if (this.cyclesDone >= this.cyclesTarget) {
      if (Math.random() < this.rotateChance) {
        this.rotate(); // fires onCycleStart inside
        return;
      }
      this.cyclesDone = 0;
      this.cyclesTarget = rint(this.cyclesMin, this.cyclesMax);
    }
    // Non-rotation cycle wrap — same progression, fresh colorize pass.
    this._recolorize();
    if (this.onCycleStart) this.onCycleStart(this.parsed);
  }
}
