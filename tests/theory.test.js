// Run with:  node --test tests/theory.test.js
//
// We test the pure music-theory primitives — chord building, parsing, snap.
// We don't try to test scheduling, voicing-aesthetics, or audio.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  midi,
  buildChord,
  parseChord,
  chordScale,
  snapToScale,
  intoRange,
  CHORDS,
  SCALE_MAJOR,
} from '../src/composer/theory.js';
import {
  pianoVoicing,
  bassRoot,
  bassFifth,
} from '../src/composer/voicing.js';

test('midi(): C4 is 60, A4 is 69', () => {
  assert.equal(midi(0, 4), 60);
  assert.equal(midi(9, 4), 69);
  assert.equal(midi(0, 5), 72);
});

test('buildChord(): Cmaj7 = C-E-G-B at given root', () => {
  // root pc 0 at octave 4 = midi 60
  const chord = buildChord(60, 'maj7');
  assert.deepEqual(chord, [60, 64, 67, 71]);
});

test('buildChord(): Dm7 from D = D-F-A-C', () => {
  const chord = buildChord(62, 'min7');
  assert.deepEqual(chord, [62, 65, 69, 72]);
});

test('parseChord(): common lofi symbols', () => {
  assert.deepEqual(parseChord('Cmaj7'), { rootPc: 0, quality: 'maj7' });
  assert.deepEqual(parseChord('Dm7'),   { rootPc: 2, quality: 'min7' });
  assert.deepEqual(parseChord('G7'),    { rootPc: 7, quality: 'dom7' });
  assert.deepEqual(parseChord('Am7'),   { rootPc: 9, quality: 'min7' });
  assert.deepEqual(parseChord('Bbm7b5'),{ rootPc: 10, quality: 'min7b5' });
  assert.deepEqual(parseChord('F#m9'),  { rootPc: 6, quality: 'min9' });
});

test('parseChord(): bare letter = major triad', () => {
  assert.deepEqual(parseChord('C'), { rootPc: 0, quality: 'maj' });
  assert.deepEqual(parseChord('F'), { rootPc: 5, quality: 'maj' });
});

test('parseChord(): rejects garbage', () => {
  assert.throws(() => parseChord('Hmin7'));
  assert.throws(() => parseChord('Cmajor7th'));
});

test('chordScale(): Cmaj7 sits in C major', () => {
  const pcs = chordScale({ rootPc: 0, quality: 'maj7' });
  // every chord tone (C E G B) should be in the scale
  for (const t of [0, 4, 7, 11]) assert.ok(pcs.includes(t), `pc ${t} missing`);
});

test('chordScale(): Dm7 sits in D dorian (= C major)', () => {
  const pcs = chordScale({ rootPc: 2, quality: 'min7' });
  for (const t of [2, 5, 9, 0]) assert.ok(pcs.includes(t), `pc ${t} missing`);
});

test('snapToScale(): in-scale notes pass through unchanged', () => {
  const cmaj = SCALE_MAJOR;
  assert.equal(snapToScale(60, cmaj), 60); // C
  assert.equal(snapToScale(64, cmaj), 64); // E
  assert.equal(snapToScale(67, cmaj), 67); // G
});

test('snapToScale(): C# in C-major snaps to C or D (nearest)', () => {
  const cmaj = SCALE_MAJOR;
  const snapped = snapToScale(61, cmaj); // C#4
  assert.ok([60, 62].includes(snapped), `unexpected snap result: ${snapped}`);
});

test('intoRange(): wraps by octave into [lo, hi]', () => {
  assert.equal(intoRange(72, 40, 52), 48);  // C5 → C3
  assert.equal(intoRange(30, 40, 52), 42);  // F#1 → F#2
  assert.equal(intoRange(45, 40, 52), 45);  // already in range
});

test('pianoVoicing(): Cmaj7 voicing lives inside piano range, drops root', () => {
  const v = pianoVoicing({ rootPc: 0, quality: 'maj7' });
  for (const n of v) {
    assert.ok(n >= 55 && n <= 76, `note ${n} out of piano range`);
  }
  // root pc 0 should NOT appear as the lowest note (rootless voicing)
  const pcs = v.map(n => ((n % 12) + 12) % 12);
  // E (4), G (7), B (11) must all be present
  for (const t of [4, 7, 11]) assert.ok(pcs.includes(t), `chord tone pc ${t} missing`);
});

test('pianoVoicing(): voicing notes are all chord tones', () => {
  for (const sym of ['Cmaj7', 'Dm7', 'G7', 'Am7', 'Fmaj7', 'Em7']) {
    const chord = parseChord(sym);
    const v = pianoVoicing(chord);
    const chordPcs = new Set(CHORDS[chord.quality].map(i => (chord.rootPc + i) % 12));
    for (const n of v) {
      const pc = ((n % 12) + 12) % 12;
      assert.ok(chordPcs.has(pc), `${sym}: note ${n} (pc ${pc}) not a chord tone`);
    }
  }
});

test('bassRoot()/bassFifth(): land in bass range 40..52', () => {
  for (const sym of ['Cmaj7', 'Dm7', 'G7', 'Am7', 'Fmaj7', 'Em7', 'Bbm7b5']) {
    const chord = parseChord(sym);
    const r = bassRoot(chord);
    const f = bassFifth(chord);
    assert.ok(r >= 40 && r <= 52, `${sym}: bass root ${r} out of range`);
    assert.ok(f >= 40 && f <= 52, `${sym}: bass fifth ${f} out of range`);
  }
});

test('bassRoot(): pc matches chord root', () => {
  for (const sym of ['Cmaj7', 'Dm7', 'G7', 'Am7', 'Fmaj7']) {
    const chord = parseChord(sym);
    const r = bassRoot(chord);
    assert.equal(((r % 12) + 12) % 12, chord.rootPc, `${sym}: bass root pc mismatch`);
  }
});
