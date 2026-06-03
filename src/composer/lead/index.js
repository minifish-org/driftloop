// Lead-provider factory.
//
// Modes:
//   'off' — no lead voice
//   'rnn' — Magenta.js Basic MelodyRNN

import { RnnLead } from './rnn.js';

export const LEAD_MODES = ['off', 'rnn'];

// `opts` are passed through to the provider constructor. Returns null
// for 'off'.
export function makeLead(mode, opts = {}) {
  if (mode === 'off') return null;
  if (mode === 'rnn') return new RnnLead(opts);
  throw new Error(`Unknown lead mode: ${mode}`);
}
