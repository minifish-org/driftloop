// Drum-pattern library. Patterns are 16 sixteenth-note steps per bar (4/4),
// keyed by GM drum-note name.
//
// GM percussion (channel 9):
//   36 = Bass Drum 1 (kick)
//   38 = Acoustic Snare
//   42 = Closed Hi-Hat
//   44 = Pedal Hi-Hat
//   46 = Open Hi-Hat
//   51 = Ride Cymbal 1

const KICK = 36;
const SNARE = 38;
const HH_CLOSED = 42;
const HH_OPEN = 46;

// Each pattern is { kick, snare, hh, hh_open } — 16-step bitmaps.
// 1 = hit, 0 = rest. Boom-bap stays slow and uncluttered.
export const LOFI_PATTERNS = [
  {
    name: 'basic',
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    hh_open:[0,0,0,0,0,0,0,1, 0,0,0,0, 0,0,0,1],
  },
  {
    name: 'lazy',
    // kick on 1 and ghost & of 2; snare slightly behind (delayed via velocity feel)
    kick:  [1,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,0, 0,0,0,1],
  },
  {
    name: 'two-and',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hh:    [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0],
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: 'wide',
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    hh:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],
    hh_open:[0,0,0,1, 0,0,0,1, 0,0,0,1, 0,0,0,0],
  },
];

const STEP_BEATS = 0.25; // one sixteenth = 0.25 beats
const DRUM_DUR  = 0.1;   // drums are short; duration mostly cosmetic

const VEL = {
  kick:    100,
  snare:    92,
  hh:       58,
  hh_open:  72,
};

const NOTE = {
  kick:    KICK,
  snare:   SNARE,
  hh:      HH_CLOSED,
  hh_open: HH_OPEN,
};

// swing: fraction of a beat to shift off-beat 8th notes later (steps 2/6/10/14).
// 0 = straight, 0.08–0.12 = classic lofi shuffle, 0.167 = full triplet swing.
export function drumEvents(pattern, channel = 9, swing = 0) {
  const events = [];
  for (const voice of ['kick', 'snare', 'hh', 'hh_open']) {
    const steps = pattern[voice];
    if (!steps) continue;
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i]) continue;
      // gentle humanisation of velocity so hihat doesn't sound machine-gunned
      const jitter = voice === 'hh' ? (i % 4 === 0 ? 8 : -4) : 0;
      // off-beat 8ths (i mod 4 === 2) get pushed back for swing feel
      const swingShift = (i % 4 === 2) ? swing : 0;
      events.push({
        channel,
        note: NOTE[voice],
        velocity: Math.max(20, Math.min(127, VEL[voice] + jitter)),
        time: i * STEP_BEATS + swingShift,
        duration: DRUM_DUR,
      });
    }
  }
  return events;
}

// One-bar drum fills — used at the end of a progression cycle to break the
// loop. Each is the same 16-step bitmap shape as LOFI_PATTERNS.
export const LOFI_FILLS = [
  {
    name: 'snare-roll-4',
    kick:  [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,1,1,1],  // 16th snare roll on beat 4
    hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 0,0,0,0],
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,1, 0,0,0,0],
  },
  {
    name: 'kick-double',
    kick:  [1,0,0,0, 0,0,1,1, 0,0,1,0, 0,0,1,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    hh:    [1,0,1,0, 1,0,0,0, 1,0,1,0, 1,0,1,1],
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,0, 0,0,0,1],
  },
  {
    name: 'half-time',
    kick:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],   // kick only on 1 and 3
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],   // snare only on 4
    hh:    [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0],   // quarter-note hat
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,0, 0,0,0,0],
  },
  {
    name: 'kick-rush',
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 1,1,1,1],   // 16th kicks on beat 4
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 0,0,0,0],
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,0, 0,0,0,1],
  },
  {
    name: 'sparse-resolve',
    kick:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],   // huge breath
    snare: [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    hh:    [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    hh_open:[0,0,0,0,0,0,0,0, 0,0,0,0, 1,0,0,0],   // open hat crash on 4
  },
  {
    name: 'snare-bump',
    kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0],   // extra snare on & of 4
    hh:    [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    hh_open:[0,0,0,0,0,0,0,1, 0,0,0,0, 0,0,0,0],
  },
];
