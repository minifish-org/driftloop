// FluidSynth-WASM wrapper around js-synthesizer (UMD globals injected by
// <script> tags in index.html). Exposes a small, ESM-friendly facade so the
// rest of the codebase doesn't have to know about the global JSSynth object.

// GeneralUser-GS is hosted upstream by its maintainer (mrbumpy409). The
// raw GitHub URL sets Access-Control-Allow-Origin: * so the browser can
// fetch it cross-origin from wherever this app is deployed. We fetch from
// upstream rather than bundling the 32 MB file with the deploy because
// Cloudflare Pages (our deploy target) caps single files at 25 MiB. After
// the first successful fetch the service worker caches the response, so
// subsequent loads are fully offline.
const DEFAULT_SF_URL = 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2';

export class Synth {
  constructor() {
    this.audioCtx = null;
    this.synth = null;
    this.gain = null;
    this.ready = false;
  }

  async init({ soundfontUrl = DEFAULT_SF_URL, onProgress = () => {} } = {}) {
    if (this.ready) return;

    if (typeof globalThis.JSSynth === 'undefined') {
      throw new Error(
        'JSSynth global not found. The js-synthesizer <script> tags in ' +
        'index.html did not load — check network / CSP.',
      );
    }

    onProgress('Waiting for FluidSynth WASM…');
    await JSSynth.waitForReady();

    onProgress('Creating AudioContext…');
    this.audioCtx = new AudioContext();

    onProgress('Initialising synth…');
    this.synth = new JSSynth.Synthesizer();
    this.synth.init(this.audioCtx.sampleRate);

    const node = this.synth.createAudioNode(this.audioCtx, 8192);
    // a master gain stage so we can taper output if multi-voice mix is hot
    this.gain = this.audioCtx.createGain();
    this.gain.gain.value = 0.7;
    node.connect(this.gain);
    this.gain.connect(this.audioCtx.destination);

    onProgress('Fetching SoundFont (~32 MB)…');
    const res = await fetch(soundfontUrl);
    if (!res.ok) {
      throw new Error(`SoundFont HTTP ${res.status} at ${soundfontUrl}`);
    }
    const buf = await res.arrayBuffer();

    onProgress('Loading SoundFont into FluidSynth…');
    await this.synth.loadSFont(buf);

    this.ready = true;
    onProgress('Ready.');
  }

  async resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
  }

  get currentTime() {
    return this.audioCtx ? this.audioCtx.currentTime : 0;
  }

  programChange(channel, program) {
    this.synth.midiProgramChange(channel, program);
  }

  noteOn(channel, note, velocity) {
    this.synth.midiNoteOn(channel, note, velocity);
  }

  noteOff(channel, note) {
    this.synth.midiNoteOff(channel, note);
  }

  // Silence every voice on every channel. Used by the scheduler on Stop.
  allNotesOff() {
    if (!this.synth) return;
    for (let ch = 0; ch < 16; ch++) {
      // CC 123 = All Notes Off; CC 120 = All Sound Off. Send both for safety.
      try { this.synth.midiControl(ch, 120, 0); } catch (_) {}
      try { this.synth.midiControl(ch, 123, 0); } catch (_) {}
    }
  }
}
