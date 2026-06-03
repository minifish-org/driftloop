// Genre registry. Maps the genre id used by the UI to a composer
// constructor. Adding a new genre = drop a file in this folder + one line
// here.

import { LofiComposer }      from './lofi.js';
import { AmbientComposer }   from './ambient.js';
import { JazzComposer }      from './jazz.js';
import { ClassicalComposer } from './classical.js';

export const GENRES = {
  lofi:      { label: 'lofi',      ctor: LofiComposer      },
  ambient:   { label: 'ambient',   ctor: AmbientComposer   },
  jazz:      { label: 'jazz',      ctor: JazzComposer      },
  classical: { label: 'classical', ctor: ClassicalComposer },
};

export const GENRE_ORDER = ['lofi', 'ambient', 'jazz', 'classical'];

export function makeComposer(id) {
  const g = GENRES[id];
  if (!g) throw new Error(`Unknown genre: ${id}`);
  return new g.ctor();
}
