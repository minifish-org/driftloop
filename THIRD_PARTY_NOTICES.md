# Third-party notices

Driftloop application code is AGPL-3.0-or-later. The components below retain their
original licenses; the root LICENSE does not relicense them.

## Vendored audio libraries

Both files were verified byte-for-byte against the npm `js-synthesizer@1.8.5`
distribution (https://registry.npmjs.org/js-synthesizer/-/js-synthesizer-1.8.5.tgz):

| Local file | Upstream file | License |
| --- | --- | --- |
| `vendor/js-synthesizer/js-synthesizer.js` | `dist/js-synthesizer.js` | BSD-3-Clause |
| `vendor/js-synthesizer/libfluidsynth.js` | `externals/libfluidsynth-2.3.0-with-libsndfile.js` | LGPL-2.1 |

The files are unmodified apart from the second file's name. Full license texts
are in `licenses/`. js-synthesizer copyright belongs to its upstream authors,
including jet; FluidSynth and linked libraries retain their upstream notices.

Corresponding source and build instructions:

- [js-synthesizer source](https://github.com/jet2jet/js-synthesizer/tree/v1.8.5)
- [FluidSynth Emscripten source and build instructions](https://github.com/jet2jet/fluidsynth-emscripten/tree/v2.3.0-em2)

The synthesizer is a separately loaded replaceable JavaScript/WASM library. To
use a modified LGPL library, build the with-libsndfile variant using the upstream
Emscripten instructions, replace `vendor/js-synthesizer/libfluidsynth.js`, and
clear the site's service-worker cache before reloading. No signature lock or
restriction on modifying/debugging the library is imposed by this application.
Keep its source/build instructions and notices available with redistributed builds.

## SoundFont (downloaded at runtime)

The current default is MuseScore General Lite, fetched from
[LibreScore/sf3](https://github.com/LibreScore/sf3), not GeneralUser-GS. Its
[complete copyright and permission notice](licenses/MuseScore-General-Lite.copyright)
identifies MIT, public-domain and CC0 material. The SoundFont is cached in the
browser and is not included in this repository. Keep its notices with any copy.

## Optional lead model

Magenta.js 1.23.1 is loaded from jsDelivr; the ImprovRNN checkpoint is fetched from
Google's `magentadata` storage. See [Magenta.js](https://github.com/magenta/magenta-js)
for Apache-2.0 code licensing and upstream model documentation. TensorFlow.js and
other transitive components retain their own notices. These remote dependencies
are not covered by Driftloop's AGPL grant; check their upstream terms before
redistributing them or substituting checkpoints.
