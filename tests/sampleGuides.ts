import type { Guide } from '../src/lib/guides';

/** Stand-ins for the guide files (the site ships none yet): same shape as the real ones. */
export const sampleGuides: Guide[] = [
  {
    slug: 'how-to-read-the-build-stats', title: 'How to read the build stats', date: '2026-11-05',
    summary: 'What the percentages mean, why a hero page has two sources, and how to use the stat targets.',
    body: `Start with [the modes](#/modes). ${'The numbers are shares of players. '.repeat(10)}`,
  },
  {
    slug: 'game-modes-and-success-rates', title: 'Game modes and hero success rates', date: '2026-11-04',
    summary: 'What the Modes page shows for hunts, the abyss and expeditions, and how the Rift season fits in.',
    body: `Back to [the guides](#/guides). ${'Hunts, abyss and expeditions each have rankings. '.repeat(10)}`,
  },
];

/** The module factory to give vi.mock('../src/lib/guides', ...): the sample guides instead of the files. */
export const guidesModule = async () => {
  const { sampleGuides: list } = await import('./sampleGuides');
  return { guides: list, findGuide: (slug: string) => list.find((g) => g.slug === slug) };
};
