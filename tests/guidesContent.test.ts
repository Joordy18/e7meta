import { describe, expect, it } from 'vitest';
import { guides } from '../src/lib/guides';

// the guide files in src/content/guides (none yet): whatever is added there must be well formed
describe('the guides that ship with the site', () => {
  it('have unique slugs and are listed newest first', () => {
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length);
    const dates = guides.map((g) => g.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
  it('each has a title, a summary, an ISO date and a body', () => {
    for (const g of guides) {
      expect(g.title.length, g.slug).toBeGreaterThan(3);
      expect(g.summary.length, g.slug).toBeGreaterThan(10);
      expect(g.date, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.body.trim().length, g.slug).toBeGreaterThan(200);
    }
  });
  it('every internal link points at a real page', () => {
    const slugs = new Set(guides.map((g) => g.slug));
    for (const g of guides) {
      for (const [, url] of g.body.matchAll(/\]\((#\/[^)\s]*)\)/g)) {
        const ok = url === '#/' || url === '#/modes' || url === '#/guides' || /^#\/hero\/c\d+$/.test(url)
          || (url.startsWith('#/guides/') && slugs.has(url.slice('#/guides/'.length)));
        expect(ok, `${g.slug} links to ${url}`).toBe(true);
      }
    }
  });
});
