# Notes for Claude agents working on driftloop

## Project context

driftloop is a **pure-frontend web app** that streams continuous, generative
multi-instrument background music in the browser. Click Play, music starts
and never stops. Genre buttons (lofi / ambient / jazz / classical) switch
the style mid-stream. Everything runs offline once loaded.

This is a clean-slate spinoff of `~/work/distilmuse`, which tried to do the
same thing via AMT distillation and failed in a specific, well-understood
way (see Provenance). Read [README.md](README.md) before doing anything
substantive.

## Provenance — why this isn't an AI-distillation project

distilmuse hit a hard wall at M1 acceptance. The failure mode, validated:

- AMT (`stanford-crfm/music-small-800k`) in **unconditional** mode produces
  structural chaos — 10-second clips contain 14–15 distinct GM programs each,
  with no rhythmic anchor. Listening test: "cacophony, instruments fighting".
- Tightening sampling (top_p 0.98 → 0.85) does not reduce this. Same 14–15
  programs come out. It's not a sampling-temperature problem; AMT's
  unconditional decoder doesn't have a coherent multi-track prior.
- 200 distilled samples — what fits in a sane compute budget on one Mac —
  is far below what a transformer needs. Student val_loss diverged from
  train at step ~200. Scaling to 10k+ would take days of compute and is not
  guaranteed to fix the upstream teacher-quality issue.
- AMT itself is designed for **anticipation** (conditional continuation
  given controls), not unconditional bootstrap. Using it as an unconditional
  MIDI teacher was the wrong tool for the job.
- The SoundFont rendering layer is **not** the bottleneck — verified by
  listening to teacher samples through the same FluidSynth + GeneralUser-GS
  pipeline driftloop will ship.

The distillation pipeline (v3 tokenizer + MLX student + train loop +
retokenize) ran end-to-end without bugs. The block was upstream, at the
teacher's output quality.

The takeaway: **the listening experience is bottlenecked by music structure,
not by model capacity**. Algorithmic composition (rules + templates) handles
the structure-stable layer; a small ML model (Magenta MelodyRNN, ~5 MB,
runs in-browser via TensorFlow.js) handles the lead-melody layer. No giant
AI is needed, and shipping in the browser is dramatically simpler than via
a Python backend.

## Architecture (locked — do not revisit)

```
Browser
├── Algorithmic composition (vanilla JS, rule-based)
│   ├── chord progression library
│   ├── drum pattern templates
│   ├── bass walking
│   └── voicing rules
├── Magenta.js MelodyRNN (~5 MB pretrained, lead melody only) — added in M3
├── js-synthesizer (FluidSynth WASM port, ~1 MB)
└── GeneralUser-GS SoundFont (~32 MB, in public/soundfonts/)
        ↓
WebAudio scheduling → speaker
```

Zero Python, zero server, zero account system. Build step is optional
(vanilla HTML + JS + ESM is fine for v1; introduce Vite only if module
organization genuinely demands it).

The full pure-frontend audio stack is **validated**: see the working demo at
`~/work/distilmuse/outputs/demo/index.html` — it loads `js-synthesizer@1.8.5`
from unpkg, fetches `GeneralUser-GS.sf2`, and synthesizes "Twinkle Twinkle"
through three GM programs in the browser. Reuse the loader logic when
wiring `src/synth/fluid.js`.

## Milestones

### M1 — Algorithmic lofi end-to-end

- One genre: lofi.
- Composer: 5–10 lofi chord progressions, slow boom-bap drum pattern,
  walking bass, piano voicing rules.
- Output → js-synthesizer → WebAudio.
- Minimal UI: Play / Stop / New.
- **Acceptance**: 5 minutes of continuous lofi that doesn't feel repetitive
  and doesn't feel chaotic. Drum stays in pocket, key doesn't drift, but
  each "New" yields a different arrangement.

### M2 — Multi-genre

- Add ambient, jazz, classical — or whichever survived the M1 listen.
- Each genre = a parameter pack: chord_lib / drum_pattern / instrument_set /
  voicing_rule / bpm_range.
- Genre grid replaces "New" but keeps "Next".
- Transitions smooth: finish current bar, next bar uses new parameters.
- **Acceptance**: blind listen — can you identify which button is active by
  ear alone, 5 seconds after the transition?

### M3 — MelodyRNN lead

- Integrate Magenta.js Basic (or Lookback) MelodyRNN.
- Per bar: current chord → MelodyRNN prime → continue 16 steps.
- Grammar guard: snap out-of-scale notes to nearest in-scale.
- A/B compare vs algorithmic lead.
- **Acceptance**: MelodyRNN lead is audibly more interesting without
  destabilising the foundation underneath.

### M4 — Production polish

- PWA: manifest, service worker, icon, installable.
- iOS Safari quirks: audio session, autoplay gesture, background resume,
  silent-switch behaviour.
- Deploy to GitHub Pages.
- **Acceptance**: open URL on phone, click Play, 30+ minutes without
  glitches.

## What to reuse from distilmuse

Direct copy (already at `public/soundfonts/GeneralUser-GS.sf2`):

- `GeneralUser-GS.sf2` — same 32 MB SoundFont, same quality.

Reference but re-implement as ESM in `src/synth/`:

- `~/work/distilmuse/outputs/demo/index.html` — proven js-synthesizer
  loading + AudioContext wiring + GM `program_change`.

Everything else in distilmuse (`model.py`, `train.py`, `generate.py`,
`distill/`, the Python venvs, the MLX checkpoints) is **out of scope**.
distilmuse stays on disk as the distillation-learning archive.

## What NOT to do

- **No Python backend.** Pure-frontend is a hard architectural constraint;
  breaking it gives up the whole point of the pivot.
- **No model bigger than MelodyRNN (~5 MB).** MusicVAE, MusicGen, Stable
  Audio are out of scope — download size explodes, mobile devices choke,
  scope overlaps with the algorithmic layer.
- **No account system, no cloud sync, no telemetry.** This isn't Spotify.
- **No "we're competing with Suno" framing.** Wrong league, wrong target.
  We're building "music you can keep running while you read", not "AI music
  as art object".
- **No prerecorded clips in the playback path.** Every sound is synthesized
  live in the browser from MIDI events. Loops are a non-goal.
- **Don't reintroduce v1/v2 tokenizers, AMT distillation, or any of the
  Python/MLX modelling stack from distilmuse.** They belong to that
  archive; the pivot specifically rejected them.

## Conventions

- Project files (README, code, comments) in English.
- Conversations with the human can be in Chinese.
- Default to vanilla JS + ESM. Add Vite/TypeScript only when complexity
  genuinely justifies the build step.
- Test the music-theory primitives (voicing, scale snapping, chord building).
  Don't bother unit-testing UI plumbing or audio scheduling — listen to it
  instead.
- Commit messages in prose, matching the distilmuse style — short summary
  line followed by 1–2 paragraphs of motivation.
