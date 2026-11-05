import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { findGuide, guides } from '../src/lib/guides';
import GuidesPage, { GuidePage } from '../src/pages/GuidesPage';
import App from '../src/App';

afterEach(cleanup);

describe('the guides that ship with the site', () => {
  it('there are some, newest first, with unique slugs', () => {
    expect(guides.length).toBeGreaterThanOrEqual(2);
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

describe('GuidesPage', () => {
  it('lists every guide with its summary, linking to it', () => {
    render(<GuidesPage />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(guides.length);
    const first = within(items[0]).getByRole('link', { name: guides[0].title });
    expect(first.getAttribute('href')).toBe(`#/guides/${guides[0].slug}`);
    expect(within(items[0]).getByText(guides[0].summary)).toBeTruthy();
    expect(within(items[0]).getByText(guides[0].date)).toBeTruthy();
  });
});

describe('GuidePage', () => {
  it('shows a guide: title, date and its content', () => {
    const g = guides[0];
    render(<GuidePage slug={g.slug} />);
    expect(screen.getByRole('heading', { level: 1, name: g.title })).toBeTruthy();
    expect(screen.getByText(g.date)).toBeTruthy();
    expect(screen.getByRole('link', { name: /All guides/ }).getAttribute('href')).toBe('#/guides');
    expect(findGuide(g.slug)).toBe(g);
  });
  it('says so when the guide does not exist', () => {
    render(<GuidePage slug="nope" />);
    expect(screen.getByText('Guide not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: /All guides/ })).toBeTruthy();
  });
});

describe('App navigation', () => {
  afterEach(() => { location.hash = ''; });
  it('opens the guides index and a single guide from the address', () => {
    location.hash = '#/guides';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guides' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Guides' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    location.hash = `#/guides/${guides[0].slug}`;
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: guides[0].title })).toBeTruthy();
  });
  it('offers Heroes, Modes and Guides', () => {
    location.hash = '#/';
    render(<App />);
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Heroes', '#/'], ['Modes', '#/modes'], ['Guides', '#/guides'],
    ]);
  });
});
