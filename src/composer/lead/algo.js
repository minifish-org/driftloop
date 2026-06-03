// Algorithmic lead-line generator. One bar at a time, eighth-note grid,
// stepwise motion biased toward chord tones on strong beats. Maintains
// previous-bar's last pitch as a starting point so phrases connect.
//
// This is the A/B baseline against the MelodyRNN lead.

import { buildChord, snapToScale } from '../theory.js';

// Eighth-note rhythm patterns over 4 beats (8 slots, each = 0.5 beat).
// Some are sparse, some busy; picked randomly per bar.
const RHYTHMS = [
  [1, 0, 1, 0, 1, 0, 1, 0],     // straight eighths
  [1, 0, 0, 1, 0, 1, 1, 0],     // syncopated
  [0, 1, 1, 0, 1, 1, 0, 1],     // off-beat heavy
  [1, 0, 1, 1, 0, 1, 0, 0],     // sparse triadic feel
  [1, 1, 0, 1, 1, 0, 1, 1],     // busy noodling
  [1, 0, 0, 0, 1, 0, 1, 0],     // very sparse
];

function pickRandom(a) { return a[Math.floor(Math.random() * a.length)]; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

// Find the midi note closest to `currentMidi` whose pitch-class is in `pcs`.
function nearestPcMidi(currentMidi, pcs) {
  let best = currentMidi;
  let bestDist = 99;
  for (let d = 0; d <= 12; d++) {
    for (const sign of [+1, -1]) {
      const cand = currentMidi + sign * d;
      const pc = ((cand % 12) + 12) % 12;
      if (pcs.includes(pc) && d < bestDist) {
        best = cand;
        bestDist = d;
      }
    }
    if (bestDist < 99 && d > bestDist) break;
  }
  return best;
}

export class AlgoLead {
  constructor({ range = [60, 84] } = {}) {
    this.range = range;     // [lo, hi] midi pitches the lead stays inside
    this.prevPitch = 67;    // G4 — gets re-seeded by startProgression
  }

  startProgression(chords, _bpm) {
    if (!chords.length) return;
    // start near the first chord's 3rd in midrange
    const c = chords[0];
    const third = buildChord(0, c.quality)[1] ?? 4;
    this.prevPitch = clamp(c.rootPc + 60 + third, this.range[0], this.range[1]);
  }

  barNotes(chord, scalePcs, _barIdx) {
    const rhythm = pickRandom(RHYTHMS);
    const chordPcs = buildChord(0, chord.quality).map(i => (chord.rootPc + i) % 12);
    const notes = [];
    let p = this.prevPitch;
    for (let i = 0; i < rhythm.length; i++) {
      if (!rhythm[i]) continue;
      const beat = i * 0.5;
      const isStrong = i === 0 || i === 4;
      let candidate;
      if (isStrong || Math.random() < 0.35) {
        candidate = nearestPcMidi(p, chordPcs);
      } else {
        const step = Math.random() < 0.65 ? (Math.random() < 0.55 ? 1 : 2) : 3;
        const sign = Math.random() < 0.5 ? -1 : 1;
        candidate = p + sign * step;
        candidate = snapToScale(candidate, scalePcs);
      }
      candidate = clamp(candidate, this.range[0], this.range[1]);
      notes.push({
        pitch: candidate,
        time: beat,
        duration: 0.45,
        velocity: 78 + (isStrong ? 6 : 0) + Math.floor(Math.random() * 6),
      });
      p = candidate;
    }
    this.prevPitch = p;
    return notes;
  }
}
