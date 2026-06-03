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

// Returns ascending array of midi notes for a piano comping voicing.
// `chord` is { rootPc, quality }.
export function pianoVoicing(chord) {
  const rootMidi = chord.rootPc; // pitch-class only; we'll re-octave below
  // Build absolute pitches from root pc 0, then drop root and centre cluster.
  const tones = buildChord(rootMidi, chord.quality);
  let body = tones.slice(1); // drop root

  // Bring body into the piano range, keeping intervals.
  // Step 1: shift the lowest tone into a full octave window starting at PIANO_LO.
  // (A narrower window misses pitch classes that simply aren't in it.)
  const lowestRaw = body[0];
  let shift = 0;
  while (lowestRaw + shift < PIANO_LO) shift += 12;
  while (lowestRaw + shift >= PIANO_LO + 12) shift -= 12;
  body = body.map(n => n + shift);

  // Step 2: drop any tone that pokes above PIANO_HI by one octave.
  body = body.map(n => (n > PIANO_HI ? n - 12 : n));

  // Step 3: sort and dedupe.
  body = Array.from(new Set(body)).sort((a, b) => a - b);

  return body;
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
