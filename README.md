# driftloop

Generative background music in your browser: lofi, ambient, jazz and classical.
Harmony, rhythm, bass and voicings are composed algorithmically and synthesized
live. An optional Magenta ImprovRNN model supplies chord-conditioned lead melodies.
No account or application backend is required.

## Run locally

Requires Python 3 for the development server and a browser with WebAudio. Node.js
22 is used for the tests. From a clone:

```sh
git clone https://github.com/minifish-org/driftloop.git
cd driftloop
python3 -m http.server 8001 --bind 127.0.0.1
```

Open http://localhost:8001 and press Play. Choose a genre or enable the optional
lead model. `file://` is unsupported because asset fetching requires HTTP.

## Downloads and offline use

The first playback downloads the roughly 40 MB **MuseScore General Lite** SoundFont
from LibreScore's GitHub repository. FluidSynth WASM and js-synthesizer are vendored
locally. The optional lead model loads Magenta.js 1.23.1 from jsDelivr and the
`chord_pitches_improv` checkpoint from Google storage. These requests reveal normal
network metadata to those hosts. There is no application telemetry or account sync.

The service worker caches successful asset fetches. Offline playback requires the
app and selected assets to have loaded successfully first; private browsing, cache
eviction or clearing site data can require another download. Verify offline reload
and playback on the target browser before relying on it. Remote assets may change
or become unavailable independently of this project.

## Development

```sh
node --test tests/theory.test.js
```

Tests cover composition primitives; they do not certify audio quality, long-running
playback or device compatibility. This is an experimental personal project.

## Static hosting

There is no application build dependency. `bash scripts/build.sh` stamps
`version.js` with the deployment revision and assembles the public files into
`dist/`. Publish **only `dist/`**, not the repository root.

For Cloudflare Pages: framework None, build command `bash scripts/build.sh`, output
directory `dist`. Any HTTPS static host can serve the same output. The external
SoundFont is fetched on first playback and is not bundled in the deployment.

## Mobile limitations

Audio must start from a user gesture. Browsers may pause audio on screen lock or
when backgrounded; silent-mode behavior and Wake Lock support vary by device.
Keep the page visible during playback. Installing the PWA does not guarantee
background playback or permanent offline storage.

## License and contributions

Application code: [AGPL-3.0-or-later](LICENSE). Audio libraries, SoundFont and model
assets have separate licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
