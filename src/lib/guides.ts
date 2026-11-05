import { parseGuide, type GuideMeta } from './markdown';

export type Guide = GuideMeta & { slug: string; body: string };

// every src/content/guides/<slug>.md is a guide; Vite inlines them at build time
const files = import.meta.glob('../content/guides/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const guides: Guide[] = Object.entries(files)
  .map(([path, raw]) => {
    const { meta, body } = parseGuide(raw);
    return { slug: path.split('/').pop()!.replace(/\.md$/, ''), ...meta, body };
  })
  .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

export const findGuide = (slug: string) => guides.find((g) => g.slug === slug);
