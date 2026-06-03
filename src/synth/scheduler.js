// Lookahead scheduler: every TICK_MS, walks the timeline forward until we
// have at least LOOKAHEAD_MS of MIDI events queued, asking the composer for
// one bar at a time. Each event becomes a setTimeout firing relative to
// AudioContext.currentTime, which gives ≤25 ms jitter — comfortably tight
// enough for a slow lofi beat.

const TICK_MS = 25;
const LOOKAHEAD_MS = 120;

export class Scheduler {
  constructor(synth, composer) {
    this.synth = synth;
    this.composer = composer;
    this.running = false;
    this.barIndex = 0;
    this.nextBarTime = 0;     // AudioContext time of the next bar's downbeat
    this.timerId = null;
    this.pending = new Set(); // active setTimeout ids
    this.pendingAction = null; // {type:'swap', composer} | {type:'reset'} | null
  }

  // Queue a composer swap to take effect at the next bar boundary. Keeps
  // the current bar audible so the transition is musical (no hard cut).
  swapComposerAtNextBar(composer) {
    this.pendingAction = { type: 'swap', composer };
    if (!this.running) {
      // not playing — apply immediately so a subsequent start() uses it
      this.composer = composer;
      this.pendingAction = null;
    }
  }

  // Re-seed the current composer at the next bar boundary. Used by "Next".
  reseedAtNextBar() {
    this.pendingAction = { type: 'reset' };
    if (!this.running) {
      // not playing — apply immediately
      this._applySetup(this.composer.reset());
      this.pendingAction = null;
    }
  }

  _applySetup(setup) {
    for (const cmd of setup.setup || []) {
      this.synth.programChange(cmd.channel, cmd.program);
    }
  }

  async start() {
    if (this.running) return;
    await this.synth.resume();

    // Apply program changes / channel setup once per Start.
    this._applySetup(this.composer.reset());

    this.running = true;
    this.barIndex = 0;
    // Give ourselves a small head start so the first bar isn't racing the clock.
    this.nextBarTime = this.synth.currentTime + 0.15;

    this.tick();
    this.timerId = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timerId);
    this.timerId = null;
    for (const id of this.pending) clearTimeout(id);
    this.pending.clear();
    // Drop any queued swap/reset — start() will do its own composer.reset()
    // anyway, and a leftover pendingAction would double-fire on the first
    // tick after the next Start.
    this.pendingAction = null;
    this.synth.allNotesOff();
  }

  tick() {
    if (!this.running) return;
    const now = this.synth.currentTime;
    const horizon = now + LOOKAHEAD_MS / 1000;

    // Drift recovery: if the page was backgrounded for a while, the
    // AudioContext clock kept advancing but our setTimeouts were throttled
    // (and we wouldn't have wanted them to fire mid-suspension anyway).
    // If we've fallen more than ~1 s behind, jump nextBarTime forward to
    // the present so we don't dump a flood of stale bars at the synth.
    if (now - this.nextBarTime > 1.0) {
      this.nextBarTime = now + 0.15;
    }

    while (this.nextBarTime < horizon) {
      // Apply any pending genre swap / re-seed at this bar boundary.
      if (this.pendingAction) {
        const action = this.pendingAction;
        this.pendingAction = null;
        if (action.type === 'swap') {
          this.composer = action.composer;
          this._applySetup(this.composer.reset());
        } else if (action.type === 'reset') {
          this._applySetup(this.composer.reset());
        }
      }

      const bar = this.composer.nextBar(this.barIndex);
      const secPerBeat = 60 / bar.bpm;

      for (const ev of bar.events) {
        const onAt  = this.nextBarTime + ev.time * secPerBeat;
        const offAt = onAt + ev.duration * secPerBeat;
        this.scheduleAt(onAt,  () => this.synth.noteOn(ev.channel, ev.note, ev.velocity));
        this.scheduleAt(offAt, () => this.synth.noteOff(ev.channel, ev.note));
      }

      this.nextBarTime += bar.beats * secPerBeat;
      this.barIndex += 1;
    }
  }

  scheduleAt(audioTime, fn) {
    const delayMs = Math.max(0, (audioTime - this.synth.currentTime) * 1000);
    let id;
    id = setTimeout(() => {
      this.pending.delete(id);
      if (this.running) fn();
    }, delayMs);
    this.pending.add(id);
  }
}
