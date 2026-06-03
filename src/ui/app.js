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
import { VERSION }     from '../../version.js';

const $ = (id) => document.getElementById(id);
const playBtn = $('play');
const stopBtn = $('stop');
const nextBtn = $('next');
const leadBtn = $('lead');
const status  = $('status');
const genreEls = Array.from(document.querySelectorAll('.genre'));

// Parse initial state from the URL so links like
//   driftloop.pages.dev/?g=jazz&lead=rnn
// open straight into a specific genre / lead mode.
function readUrlState() {
  const params = new URLSearchParams(location.search);
  const g = params.get('g');
  const lead = params.get('lead');
  return {
    genre: GENRE_ORDER.includes(g) ? g : 'lofi',
    leadIdx: LEAD_MODES.includes(lead) ? LEAD_MODES.indexOf(lead) : 0,
  };
}

function writeUrlState() {
  const params = new URLSearchParams();
  if (activeGenre !== 'lofi') params.set('g', activeGenre);
  if (leadMode() !== 'off' && leadActive()) params.set('lead', leadMode());
  const qs = params.toString();
  const url = qs ? `?${qs}` : location.pathname;
  history.replaceState(null, '', url);
}

const initial = readUrlState();
const synth = new Synth();
let activeGenre = initial.genre;
let leadModeIdx = initial.leadIdx;
// Build the initial lead provider from URL state so a `?lead=rnn` URL
// actually wires the lead on first Play (rather than just showing the
// label until the user clicks the Lead button).
let currentLead = makeLead(LEAD_MODES[leadModeIdx], { onStatus: setStatusSafe });
let composer  = makeComposer(activeGenre);
const scheduler = new Scheduler(synth, composer);
let state = 'idle'; // 'idle' | 'loading' | 'playing' | 'stopped'

// setStatus is defined below, but makeLead may want to report progress
// during module init. This trampoline defers to the real one once it
// exists, and silently drops calls in the brief gap before that.
function setStatusSafe(line) { if (typeof setStatus === 'function') setStatus(line); }

function setStatus(line) { if (status) status.textContent = line; }

function leadMode() { return LEAD_MODES[leadModeIdx]; }

// Only lofi and jazz wire a lead voice into their bar output; ambient and
// classical ignore setLead(). The button reflects this so users don't get
// confused when toggling produces no audible change.
const LEAD_GENRES = new Set(['lofi', 'jazz']);
function leadActive() { return LEAD_GENRES.has(activeGenre); }

function refreshLeadBtn() {
  leadBtn.textContent = leadActive() ? `Lead: ${leadMode()}` : 'Lead: n/a';
}

function setButtons() {
  const loading = state === 'loading';
  playBtn.disabled = loading || state === 'playing';
  stopBtn.disabled = state !== 'playing';
  nextBtn.disabled = loading;
  leadBtn.disabled = loading || !leadActive();
  for (const el of genreEls) {
    el.disabled = loading;
    el.classList.toggle('active', el.dataset.genre === activeGenre);
  }
  refreshLeadBtn();
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
  if (!leadActive() || m === 'off') return `Playing — ${activeGenre}.`;
  return `Playing — ${activeGenre} (lead: ${m}).`;
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
  // Wake lock is acquired only after a successful start so we never leak
  // it on a failed SoundFont fetch.
  acquireWakeLock();
}

function doStop() {
  scheduler.stop();
  state = 'stopped';
  setStatus('Stopped. Click Play to resume.');
  setButtons();
  releaseWakeLock();
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
  writeUrlState();
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
  writeUrlState();
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
//
// We also listen for `controllerchange` so the user sees a notice when a
// new SW takes over (our SW calls clients.claim() on activate, so this
// fires the moment a new build is live). The page keeps running with the
// already-loaded modules — the user just won't see code changes until
// they reload.
if ('serviceWorker' in navigator) {
  let initialController = navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed:', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // First controller assignment on a fresh page load is not an "update".
    if (!initialController) { initialController = navigator.serviceWorker.controller; return; }
    setStatus('New version available — reload to apply.');
  });
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

// Keyboard shortcuts. Space plays/stops, arrows cycle genre, N re-seeds,
// L toggles the lead. Skip when modifier keys or text inputs are in play.
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLInputElement) return;
  const key = e.key;
  if (key === ' ') {
    e.preventDefault();
    if (state === 'playing') doStop();
    else doPlay().catch(console.error);
  } else if (key === 'ArrowRight' || key === 'ArrowLeft') {
    e.preventDefault();
    const i = GENRE_ORDER.indexOf(activeGenre);
    const step = key === 'ArrowRight' ? 1 : -1;
    const next = GENRE_ORDER[(i + step + GENRE_ORDER.length) % GENRE_ORDER.length];
    selectGenre(next);
  } else if (key === 'n' || key === 'N') {
    e.preventDefault();
    doNext();
  } else if (key === 'l' || key === 'L') {
    if (!leadActive()) return;
    e.preventDefault();
    cycleLead().catch(console.error);
  }
});

// Stamp build SHA (or 'dev' locally) into the footer.
const versionEl = document.getElementById('version');
if (versionEl) versionEl.textContent = `build ${VERSION}`;

refreshLeadBtn();
setStatus('Ready. Pick a genre and click Play (first time pulls ~40 MB SoundFont).');
setButtons();
