# driftloop

A pure-frontend web app that streams continuous, generative multi-instrument
background music in the browser. Click Play, music starts and never stops.
Switch between style buttons (lofi / ambient / jazz / classical) and the
arrangement morphs without a hard cut. Everything runs offline once loaded.

driftloop produces music **live** — every note is composed and synthesised in
the moment, inside the user's browser. No prerecorded loops, no server, no
account. Just a URL.

## How it works

Two layers, separated by responsibility:

1. **Algorithmic composition** — vanilla JavaScript that picks chord
   progressions, voices them onto a keyboard, walks a bass line, and triggers
   a drum pattern according to genre-specific rules. This layer guarantees
   the music is always in key, on the grid, and structurally coherent.
2. **MelodyRNN** — a small (~5 MB) pretrained Google Magenta model that runs
   in the browser via TensorFlow.js and writes the lead melody on top of the
   algorithmic foundation. Added in milestone M3.

Synthesis runs through [js-synthesizer](https://github.com/jet/js-synthesizer),
a WebAssembly port of FluidSynth, playing
[GeneralUser-GS](https://www.schristiancollins.com/generaluser.php), a
General-MIDI SoundFont, through the WebAudio API.

## Why it isn't an AI app

An earlier attempt at the same goal ([distilmuse](../distilmuse)) tried to
distil a multi-instrument music model from the Anticipatory Music Transformer
into MLX, then sample from it for the listening experience. The teacher
model's unconditional output turned out to be structurally chaotic in a way
that no amount of sampling tweaks or student-side training would fix. After
verifying that the bottleneck was upstream model quality, not the rendering
or training pipeline, driftloop started over with a different premise:
**the listening experience is bottlenecked by music structure, not by model
capacity**.

Algorithmic composition is a 50-year-old discipline that nails structure
trivially. driftloop uses it for the load-bearing layers (rhythm, harmony,
voice-leading) and reserves the small ML model for the one place it adds
audible value: the lead melody.

## Running locally

```bash
# any HTTP server works
python3 -m http.server 8001
# → http://localhost:8001/
```

`file://` won't work — the SoundFont and Magenta model fetches need HTTP for
browser CORS reasons.

## Deploying

Drop everything onto any static host — GitHub Pages, Netlify, Cloudflare
Pages, your own server. No backend, no environment variables, no secrets.
The SoundFont is the largest single asset (~32 MB); let your host's CDN
cache it.

## Project status

Bootstrapped. See [CLAUDE.md](CLAUDE.md) for the milestone breakdown and
the agent-facing project context.

## License

Code: AGPL-3.0-or-later (see `LICENSE`).
GeneralUser-GS SoundFont: see `public/soundfonts/` and the upstream
distribution at https://www.schristiancollins.com/generaluser.php — its
licence permits non-commercial and commercial use including redistribution.
