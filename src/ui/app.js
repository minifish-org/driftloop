// driftloop UI controller. Wires the genre grid + Play / Stop / Next +
// Lead toggle to Synth + Scheduler + a per-genre Composer.
//
// Genre swap is queued for the next bar boundary inside the Scheduler so
// transitions are seamless. Lead swap takes effect on the next bar too,
// because composers read this.lead each time nextBar() is called.

import { Synth }       from '../synth/fluid.js';
import { Scheduler }   from '../synth/scheduler.js';
import { GENRE_ORDER, makeComposer } from '../composer/genres/index.js';
import { LEAD_MODES, makeLead }      from '../composer/lead/index.js';

const $ = (id) => document.getElementById(id);
const playBtn = $('play');
const stopBtn = $('stop');
const nextBtn = $('next');
const leadBtn = $('lead');
const status  = $('status');
const genreEls = Array.from(document.querySelectorAll('.genre'));

const synth = new Synth();
let activeGenre = 'lofi';
let leadModeIdx = 0;        // index into LEAD_MODES
let currentLead = null;     // active lead provider, shared across composers
let composer  = makeComposer(activeGenre);
const scheduler = new Scheduler(synth, composer);
let state = 'idle'; // 'idle' | 'loading' | 'playing' | 'stopped'

function setStatus(line) { if (status) status.textContent = line; }

function leadMode() { return LEAD_MODES[leadModeIdx]; }

function refreshLeadBtn() {
  leadBtn.textContent = `Lead: ${leadMode()}`;
}

function setButtons() {
  const loading = state === 'loading';
  playBtn.disabled = loading || state === 'playing';
  stopBtn.disabled = state !== 'playing';
  nextBtn.disabled = loading;
  leadBtn.disabled = loading;
  for (const el of genreEls) {
    el.disabled = loading;
    el.classList.toggle('active', el.dataset.genre === activeGenre);
  }
}

async function ensureLoaded() {
  if (synth.ready) return;
  state = 'loading';
  setButtons();
  try {
    await synth.init({ onProgress: setStatus });
  } catch (e) {
    setStatus('Load failed: ' + e.message);
    state = 'idle';
    setButtons();
    throw e;
  }
}

function statusForPlaying() {
  const m = leadMode();
  return m === 'off'
    ? `Playing — ${activeGenre}.`
    : `Playing — ${activeGenre} (lead: ${m}).`;
}

async function doPlay() {
  await ensureLoaded();
  await scheduler.start();
  // attach the lead (if any) AFTER the composer has reset itself — that
  // way startProgression() sees this.parsed populated.
  if (currentLead) composer.setLead(currentLead);
  state = 'playing';
  setStatus(statusForPlaying());
  setButtons();
}

function doStop() {
  scheduler.stop();
  state = 'stopped';
  setStatus('Stopped. Click Play to resume.');
  setButtons();
}

function doNext() {
  scheduler.reseedAtNextBar();
  if (state === 'playing') {
    setStatus(`${statusForPlaying()} (new seed at next bar)`);
    setTimeout(() => { if (state === 'playing') setStatus(statusForPlaying()); }, 1200);
  } else {
    setStatus(`${activeGenre} re-seeded. Click Play.`);
  }
}

function selectGenre(id) {
  if (id === activeGenre) {
    doNext();
    return;
  }
  activeGenre = id;
  composer = makeComposer(id);
  if (currentLead) composer.setLead(currentLead);
  scheduler.swapComposerAtNextBar(composer);
  if (state === 'playing') {
    setStatus(`Switching to ${activeGenre} at next bar…`);
    setTimeout(() => { if (state === 'playing') setStatus(statusForPlaying()); }, 1200);
  } else {
    setStatus(`${activeGenre} ready. Click Play.`);
  }
  setButtons();
}

async function cycleLead() {
  leadModeIdx = (leadModeIdx + 1) % LEAD_MODES.length;
  refreshLeadBtn();
  const mode = leadMode();
  try {
    currentLead = makeLead(mode, { onStatus: setStatus });
  } catch (e) {
    setStatus('Lead init failed: ' + e.message);
    currentLead = null;
    return;
  }
  composer.setLead(currentLead);
  if (state === 'playing') {
    setStatus(statusForPlaying());
  } else if (mode === 'rnn') {
    setStatus('MelodyRNN will load on Play.');
  } else {
    setStatus(`Lead set to ${mode}. Click Play.`);
  }
}

for (const el of genreEls) {
  el.addEventListener('click', () => selectGenre(el.dataset.genre));
}
playBtn.addEventListener('click', () => doPlay().catch(console.error));
stopBtn.addEventListener('click', doStop);
nextBtn.addEventListener('click', doNext);
leadBtn.addEventListener('click', () => cycleLead().catch(console.error));

// ---- Production polish: PWA, wake lock, visibility resume ----

// Register the service worker for offline support. Fire-and-forget — if
// it fails (older browser, or running off file://) the app still works,
// just without offline caching.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed:', e));
}

// Screen Wake Lock keeps the device awake while playing. Best-effort:
// the API is missing on iOS Safari and older Android browsers. When it's
// missing, we still try to play — the OS may still keep audio running
// for a while when the screen locks; behaviour varies by device.
let wakeLock = null;
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); }
  catch (_) { /* user denied / browser refused — ignore */ }
}
async function releaseWakeLock() {
  if (!wakeLock) return;
  try { await wakeLock.release(); } catch (_) {}
  wakeLock = null;
}

// When the page comes back from background, re-resume the AudioContext
// (iOS often suspends it on hide) and re-acquire wake lock (the OS drops
// it when the page is hidden).
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (state === 'playing') {
    synth.resume().catch(() => {});
    acquireWakeLock();
  }
});

// Hook wake lock into Play/Stop. We re-wrap doPlay/doStop minimally
// rather than re-edit them so the original control flow stays obvious.
playBtn.addEventListener('click', () => acquireWakeLock());
stopBtn.addEventListener('click', () => releaseWakeLock());

refreshLeadBtn();
setStatus('Ready. Pick a genre and click Play (first time pulls ~32 MB SoundFont).');
setButtons();
