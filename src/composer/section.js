// SectionPlanner — gives a composer a higher-level structure than "loop
// a progression, rotate, repeat". The composer cycles through named
// sections (verse, chorus, bridge, outro) each with its own density
// level, so the arrangement has dynamic contrast across a ~16-bar song
// rather than playing every bar at maximum density forever.
//
// The composer scales velocities and gates optional events on the
// current density. When a full song template completes, advance()
// returns true so the composer can rotate the progression (new
// transposition + new chord set) for the next song.

const DENSITY = {
  verse:  0.4,
  chorus: 1.0,
  bridge: 0.6,
  outro:  0.3,
};

export class SectionPlanner {
  // template: array of { type, bars }, e.g.
  //   [{ type: 'verse', bars: 4 }, { type: 'chorus', bars: 4 }, ...]
  constructor({ template }) {
    if (!Array.isArray(template) || template.length === 0) {
      throw new Error('SectionPlanner: template must be a non-empty array');
    }
    for (const s of template) {
      if (DENSITY[s.type] == null) {
        throw new Error(`SectionPlanner: unknown section type ${s.type}`);
      }
      if (!Number.isInteger(s.bars) || s.bars < 1) {
        throw new Error(`SectionPlanner: bars must be a positive integer (got ${s.bars} for ${s.type})`);
      }
    }
    this.template = template;
    this.sectionIdx = 0;
    this.barInSection = 0;
  }

  // Snapshot of the current section. Composers read this each bar and
  // use `density` to scale their output.
  current() {
    const section = this.template[this.sectionIdx];
    return {
      type: section.type,
      density: DENSITY[section.type],
      barInSection: this.barInSection,
      sectionLength: section.bars,
      isLastBarOfSection: this.barInSection === section.bars - 1,
    };
  }

  // Advance one bar. Returns true if a full song template just completed
  // (the composer should rotate the progression for the next song).
  advance() {
    this.barInSection += 1;
    const section = this.template[this.sectionIdx];
    if (this.barInSection < section.bars) return false;
    this.barInSection = 0;
    this.sectionIdx += 1;
    if (this.sectionIdx >= this.template.length) {
      this.sectionIdx = 0;
      return true;
    }
    return false;
  }

  // Total bars per song template — useful for tests and for tuning.
  totalBars() {
    return this.template.reduce((sum, s) => sum + s.bars, 0);
  }

  // Reset to the start of the template (start of a fresh song).
  reset() {
    this.sectionIdx = 0;
    this.barInSection = 0;
  }
}
