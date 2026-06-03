// FluidSynth-WASM wrapper around js-synthesizer (UMD globals injected by
// <script> tags in index.html). Exposes a small, ESM-friendly facade so the
// rest of the codebase doesn't have to know about the global JSSynth object.

import { VinylTexture } from './texture.js';

// GeneralUser-GS is hosted upstream by its maintainer (mrbumpy409). The
// raw GitHub URL sets Access-Control-Allow-Origin: * so the browser can
// fetch it cross-origin from wherever this app is deployed. We fetch from
// upstream rather than bundling the 32 MB file with the deploy because
// Cloudflare Pages (our deploy target) caps single files at 25 MiB. After
// the first successful fetch the service worker caches the response, so
// subsequent loads are fully offline.
const DEFAULT_SF_URL = 'https://raw.githubusercontent.com/mrbumpy409/GeneralUser-GS/main/GeneralUser-GS.sf2';

// Stream a Response body to an ArrayBuffer, reporting progress as bytes
// arrive. Content-Length is best-effort — opaque responses (SW-cached
// cross-origin) may not expose it, in which case `total` is 0 and the
// callback can fall back to "X.X MB so far".
async function readWithProgress(response, onChunk) {
  const total = parseInt(response.headers.get('Content-Length') || '0', 10);
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onChunk(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out.buffer;
}

// Build a small synthetic impulse response: exponentially decaying noise.
// Sounds like a tight room. Tiny, no external file needed.
function makeRoomIR(audioCtx, durationSec = 1.8, decayExp = 3.5) {
  const len = Math.floor(audioCtx.sampleRate * durationSec);
  const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const envelope = Math.pow(1 - i / len, decayExp);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return buf;
}

export class Synth {
  constructor() {
    this.audioCtx = null;
    this.synth = null;
    this.gain = null;
    this.convolver = null;
    this.wetGain = null;
    this.vinyl = null;
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

    // Parallel wet path: gain → convolver → wetGain → destination.
    // Dry path stays gain → destination. ~22% wet gives a noticeable
    // room-tail without smearing the rhythm.
    this.convolver = this.audioCtx.createConvolver();
    this.convolver.buffer = makeRoomIR(this.audioCtx);
    this.wetGain = this.audioCtx.createGain();
    this.wetGain.gain.value = 0.22;
    this.gain.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.audioCtx.destination);

    this.gain.connect(this.audioCtx.destination);

    // Vinyl texture layer (hiss + crackle) — parked here and toggled by
    // setVinyl(true) when the active genre is lofi.
    this.vinyl = new VinylTexture(this.audioCtx, this.audioCtx.destination);

    onProgress('Fetching SoundFont…');
    const res = await fetch(soundfontUrl);
    if (!res.ok) {
      throw new Error(`SoundFont HTTP ${res.status} at ${soundfontUrl}`);
    }
    const buf = await readWithProgress(res, (loaded, total) => {
      const mb = (loaded / 1e6).toFixed(1);
      if (total) {
        const pct = Math.floor((loaded / total) * 100);
        const totalMb = (total / 1e6).toFixed(0);
        onProgress(`Fetching SoundFont (${pct}%, ${mb} / ${totalMb} MB)…`);
      } else {
        onProgress(`Fetching SoundFont (${mb} MB)…`);
      }
    });

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

  // Fade the vinyl texture bed in or out. No-op until init() has run.
  setVinyl(on) {
    if (this.vinyl) this.vinyl.setActive(on);
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
