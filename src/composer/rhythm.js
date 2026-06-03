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

export function drumEvents(pattern, channel = 9) {
  const events = [];
  for (const voice of ['kick', 'snare', 'hh', 'hh_open']) {
    const steps = pattern[voice];
    if (!steps) continue;
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i]) continue;
      // gentle humanisation of velocity so hihat doesn't sound machine-gunned
      const jitter = voice === 'hh' ? (i % 4 === 0 ? 8 : -4) : 0;
      events.push({
        channel,
        note: NOTE[voice],
        velocity: Math.max(20, Math.min(127, VEL[voice] + jitter)),
        time: i * STEP_BEATS,
        duration: DRUM_DUR,
      });
    }
  }
  return events;
}
