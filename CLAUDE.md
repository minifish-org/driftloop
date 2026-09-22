# Working on driftloop

Read README.md and THIRD_PARTY_NOTICES.md first. This is a static browser app with
algorithmic composition and an optional Magenta ImprovRNN lead. There is no Python
backend, account system, cloud sync, telemetry or prerecorded playback path.

Use vanilla JavaScript ESM. Keep code, comments and project documentation in English.
Run `node --test tests/theory.test.js` for composition changes and listen to audio
when changing synthesis/scheduling. Do not claim mobile/offline validation without
testing those conditions. Build only public assets into dist/. Preserve third-party
licenses and source/replacement instructions when updating the vendored synthesizer.
