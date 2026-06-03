// Chord → concrete piano-voice MIDI notes.
//
// Lofi piano voicings (this layer's only customer for now):
//   - drop the root (the bass plays it)
//   - keep 3rd, 5th, 7th, 9th-if-present
//   - position the cluster around middle C (C4 = 60), staying inside a
//     compact ~octave window so it sounds like one hand on the keys.

import { buildChord, intoRange } from './theory.js';

const PIANO_ANCHOR = 60;     // target centre of the voicing
const PIANO_LO     = 55;     // G3
const PIANO_HI     = 76;     // E5

// Place a pitch class as close to `anchor` as possible. Returns the
// closer of n and n+12 where n is the nearest in [anchor-6, anchor+6].
function nearestPcMidiToAnchor(pc, anchor) {
  let n = pc;
  while (n < anchor - 6) n += 12;
  while (n > anchor + 6) n -= 12;
  const alt = n + 12;
  return Math.abs(n - anchor) <= Math.abs(alt - anchor) ? n : alt;
}

function clampToPianoRange(n) {
  while (n < PIANO_LO) n += 12;
  while (n > PIANO_HI) n -= 12;
  return n;
}

// Returns ascending array of midi notes for a piano comping voicing.
// `chord` is { rootPc, quality }. When `prevVoicing` is given, the new
// voicing is voice-led: each chord tone is placed in the octave closest
// to the nearest voice in the previous voicing, so consecutive chords
// share common tones and move by small intervals — the core of jazz
// comping and Bach-style harmony alike.
export function pianoVoicing(chord, prevVoicing = null) {
  const tones = buildChord(chord.rootPc, chord.quality);
  const newPcs = tones.slice(1).map(n => ((n % 12) + 12) % 12); // drop root

  if (prevVoicing && prevVoicing.length > 0) {
    const placed = newPcs.map(pc => {
      // For each new pc, pick the octave placement closest to ANY of the
      // previous voices. Multiple new pcs may share an anchor — that's
      // fine, just means voice doubling.
      let best = pc + 60;
      let bestDist = Infinity;
      for (const prev of prevVoicing) {
        const cand = nearestPcMidiToAnchor(pc, prev);
        const d = Math.abs(cand - prev);
        if (d < bestDist) { bestDist = d; best = cand; }
      }
      return clampToPianoRange(best);
    });
    return Array.from(new Set(placed)).sort((a, b) => a - b);
  }

  // No prev: original block-placement around C4 as a cold-start anchor.
  let body = tones.slice(1);
  const lowestRaw = body[0];
  let shift = 0;
  while (lowestRaw + shift < PIANO_LO) shift += 12;
  while (lowestRaw + shift >= PIANO_LO + 12) shift -= 12;
  body = body.map(n => n + shift);
  body = body.map(n => (n > PIANO_HI ? n - 12 : n));
  return Array.from(new Set(body)).sort((a, b) => a - b);
}

// Bass: just the root, parked low. We aim for E2 (40) .. C3 (48) so chord
// roots don't jump octaves when a progression goes IV → V.
const BASS_LO = 40;
const BASS_HI = 52;
export function bassRoot(chord) {
  return intoRange(chord.rootPc + 36, BASS_LO, BASS_HI); // start near C3
}

// Bass: the 5th of the chord, same low range. Used for occasional walking.
export function bassFifth(chord) {
  return intoRange(chord.rootPc + 36 + 7, BASS_LO, BASS_HI);
}
