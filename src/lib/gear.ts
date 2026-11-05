import type { ArtifactValue } from '../shared/types';

/**
 * The game writes artifact effects with placeholders: "@" is the first value, "@@" the second, and so on.
 * Fills them for level 1 or max level; a placeholder with no value stays as it is. A literal "\\n" becomes a space.
 */
export function describeArtifact(text: string, values: ArtifactValue[], at: 'level1' | 'max'): string {
  return text
    .replace(/@+/g, (run) => {
      const v = values[run.length - 1]?.[at];
      if (v === undefined) return run;
      return Number.parseFloat(v) === 0 ? '(value not published)' : v; // the game lists some effects with 0.0%
    })
    .replace(/\\n/g, ' ');
}
