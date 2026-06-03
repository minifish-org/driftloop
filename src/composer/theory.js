// Music-theory primitives. Everything here is data + pure functions so it's
// trivially unit-testable.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NAME_TO_PC = {
  'C':  0, 'C#': 1, 'Db': 1,
  'D':  2, 'D#': 3, 'Eb': 3,
  'E':  4,
  'F':  5, 'F#': 6, 'Gb': 6,
  'G':  7, 'G#': 8, 'Ab': 8,
  'A':  9, 'A#': 10, 'Bb': 10,
  'B':  11,
};

// midi note number for a pitch class + octave (C4 = 60, MIDI convention).
export function midi(pc, octave) {
  return 12 * (octave + 1) + pc;
}

// Major scale degrees, 0-indexed pitch-class offsets from the tonic.
export const SCALE_MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const SCALE_MINOR = [0, 2, 3, 5, 7, 8, 10]; // natural minor
export const SCALE_DORIAN = [0, 2, 3, 5, 7, 9, 10];

export const CHORDS = {
  'maj':    [0, 4, 7],
  'min':    [0, 3, 7],
  'dim':    [0, 3, 6],
  'aug':    [0, 4, 8],
  'maj7':   [0, 4, 7, 11],
  'min7':   [0, 3, 7, 10],
  'dom7':   [0, 4, 7, 10],
  'min7b5': [0, 3, 6, 10],
  'dim7':   [0, 3, 6, 9],
  'maj9':   [0, 4, 7, 11, 14],
  'min9':   [0, 3, 7, 10, 14],
  'dom9':   [0, 4, 7, 10, 14],
};

// Parse symbols like "Cmaj7", "Dm7", "G7", "Bbm7b5".
// Returns { rootPc, quality }.
export function parseChord(symbol) {
  const m = symbol.match(/^([A-G][b#]?)(.*)$/);
  if (!m) throw new Error(`Cannot parse chord: ${symbol}`);
  const [, name, rest] = m;
  const rootPc = NAME_TO_PC[name];
  if (rootPc === undefined) throw new Error(`Unknown root: ${name}`);

  // Normalise common shorthands.
  let q = rest;
  if (q === '' || q === 'M') q = 'maj';
  else if (q === 'm') q = 'min';
  else if (q === '7') q = 'dom7';
  else if (q === 'M7') q = 'maj7';
  else if (q === 'm7') q = 'min7';
  else if (q === 'm7b5' || q === 'ø') q = 'min7b5';
  else if (q === 'M9') q = 'maj9';
  else if (q === 'm9') q = 'min9';
  else if (q === '9') q = 'dom9';

  if (!(q in CHORDS)) throw new Error(`Unknown quality: ${rest} in ${symbol}`);
  return { rootPc, quality: q };
}

// Build a chord at a given root midi note, return ascending midi pitches.
export function buildChord(rootMidi, quality) {
  const ints = CHORDS[quality];
  if (!ints) throw new Error(`Unknown chord quality: ${quality}`);
  return ints.map(i => rootMidi + i);
}

// Get the diatonic scale (pitch classes) for a chord — used by snapToScale.
// For 7th chords we pick a scale that contains all chord tones.
const QUALITY_SCALE = {
  'maj':   SCALE_MAJOR, 'maj7': SCALE_MAJOR, 'maj9': SCALE_MAJOR,
  'min':   SCALE_DORIAN, 'min7': SCALE_DORIAN, 'min9': SCALE_DORIAN,
  'dom7':  [0, 2, 4, 5, 7, 9, 10], // mixolydian
  'dom9':  [0, 2, 4, 5, 7, 9, 10],
  'dim':   [0, 2, 3, 5, 6, 8, 9, 11], // half-whole
  'dim7':  [0, 2, 3, 5, 6, 8, 9, 11],
  'min7b5':[0, 2, 3, 5, 6, 8, 10],     // locrian
  'aug':   [0, 2, 4, 6, 8, 10],        // whole-tone
};

export function chordScale({ rootPc, quality }) {
  const ints = QUALITY_SCALE[quality] || SCALE_MAJOR;
  return ints.map(i => (rootPc + i) % 12);
}

// Snap a midi pitch to the nearest pitch class in `pcs`. Ties resolve up.
export function snapToScale(midiNote, pcs) {
  const pc = ((midiNote % 12) + 12) % 12;
  if (pcs.includes(pc)) return midiNote;
  let best = midiNote;
  let bestDist = 999;
  for (let d = 1; d <= 6; d++) {
    for (const sign of [+1, -1]) {
      const cand = midiNote + sign * d;
      const candPc = ((cand % 12) + 12) % 12;
      if (pcs.includes(candPc) && d < bestDist) {
        best = cand;
        bestDist = d;
      }
    }
    if (bestDist < 999) return best;
  }
  return midiNote;
}

// Move a midi note into a target range by ±12 semitones until it fits.
export function intoRange(note, lo, hi) {
  let n = note;
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}
