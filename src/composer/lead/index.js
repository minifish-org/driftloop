// Lead-provider factory.
//
// Modes:
//   'off'  — no lead voice
//   'algo' — rule-based per-bar generator
//   'rnn'  — Magenta.js Basic MelodyRNN

import { AlgoLead } from './algo.js';
import { RnnLead }  from './rnn.js';

export const LEAD_MODES = ['off', 'algo', 'rnn'];

// `opts` are passed through to the provider constructor. Returns null
// for 'off'.
export function makeLead(mode, opts = {}) {
  if (mode === 'off') return null;
  if (mode === 'algo') return new AlgoLead(opts);
  if (mode === 'rnn')  return new RnnLead(opts);
  throw new Error(`Unknown lead mode: ${mode}`);
}
