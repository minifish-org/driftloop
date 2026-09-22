# Public release preparation — 2026-09-22

## Validation

`node --test tests/theory.test.js`: 32 passed. `bash scripts/build.sh`: passed. Browser smoke reached playback, genre switching and stop. Vendored audio files matched js-synthesizer 1.8.5 byte-for-byte.

Gitleaks found no secrets in the fetched local Git history at preparation time.
This is a best-effort check, not a guarantee that every possible secret is detected.

## Scope and limitations

No subjective audio quality assessment, 30-minute mobile run, offline reload, or optional ImprovRNN execution was performed.

See README.md for license, setup and project status; SECURITY.md describes support
and private reporting. Third-party material retains its upstream license.
