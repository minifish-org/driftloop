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

driftloop ships as a static site — no backend, no env vars, no secrets.
The intended target is **Cloudflare Pages**; any other static host works
too. Cloudflare Pages caps single files at 25 MiB, which is smaller than
the 32 MB GeneralUser-GS SoundFont — so the SoundFont is not part of
this deploy at all. The app fetches it on first launch from the
maintainer's public GitHub mirror at
`https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2`
(which sends `Access-Control-Allow-Origin: *`, so cross-origin fetch
just works). The service worker caches the response on first hit, so
every subsequent visit is fully offline.

All in-app asset paths are relative, so deploying to a sub-path or a
custom domain works without changes. The service worker scope is
restricted to wherever `sw.js` is served from.

### Cloudflare Pages quick-start

Connect this repo via the Cloudflare dashboard:

1. Push the project to GitHub / GitLab.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect
   to Git → pick the repo.
3. Build settings: **Framework preset = None**, **Build command = (empty)**,
   **Build output directory = `/`**. driftloop has no build step.
4. Deploy. Site appears at `<project>.pages.dev` within ~30 s.

Or from a clone using Wrangler:

```bash
npx wrangler pages deploy . --project-name=driftloop
```

The first visit downloads ~32 MB SoundFont (from its external origin) +
~1 MB of FluidSynth WASM (from unpkg). The service worker caches both,
so subsequent visits work fully offline.

## Installing as an app

driftloop is a PWA. On mobile Safari / Chrome / Edge, "Add to Home Screen"
gives you a standalone-window install with its own icon and no browser
chrome. Once installed, it runs entirely from the cache — no network
needed except for the optional MelodyRNN lead (which lazy-loads
Magenta.js + a ~5 MB checkpoint the first time you toggle it on, and
caches them).

### iOS Safari quirks worth knowing about

- **Silent switch**: WebAudio on iOS is routed through the *ambient*
  audio session, which gets muted by the physical silent switch. There's
  no public API to override this from the browser. If you want sound,
  flip the switch up.
- **Screen lock**: when the screen locks, iOS pauses background audio
  from web pages. Use the Wake Lock API (we request it on Play) to keep
  the screen on — but iOS Safari doesn't implement Wake Lock yet (as of
  iOS 17), so on iPhone the screen will sleep and audio will pause.
  Workaround for now: keep the tab open and the screen unlocked.
- **Backgrounding**: if you switch tabs / apps, the AudioContext
  suspends. When you come back, the app resumes it automatically via
  `visibilitychange`, and the scheduler skips forward rather than
  flooding the synth with stale bars.

## Project status

M1–M4 complete. See [CLAUDE.md](CLAUDE.md) for the milestone breakdown
and the agent-facing project context.

## License

Code: AGPL-3.0-or-later (see `LICENSE`).
GeneralUser-GS SoundFont: see `public/soundfonts/` and the upstream
distribution at https://www.schristiancollins.com/generaluser.php — its
licence permits non-commercial and commercial use including redistribution.
