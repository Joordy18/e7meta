import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { findGuide, guides } from '../src/lib/guides';
import GuidesPage, { GuidePage } from '../src/pages/GuidesPage';
import App from '../src/App';
import { sampleGuides } from './sampleGuides';

vi.mock('../src/lib/guides', async () => (await import('./sampleGuides')).guidesModule());

const backup = [...sampleGuides];
beforeEach(() => { sampleGuides.splice(0, sampleGuides.length, ...backup); });
afterEach(cleanup);

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
  it('says there is none yet when the site ships no guide', () => {
    sampleGuides.splice(0);
    render(<GuidesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Guides' })).toBeTruthy();
    expect(screen.getByText('No guides yet.')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
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
  it('offers Home, Heroes, Modes, Tier list, RTA and Guides', () => {
    location.hash = '#/';
    render(<App />);
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Home', '#/'], ['Heroes', '#/heroes'], ['Modes', '#/modes'], ['Tier list', '#/tiers'], ['RTA', '#/arena'], ['Guides', '#/guides'],
    ]);
  });
});
