import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import ToolsPage from '../src/pages/ToolsPage';
import App from '../src/App';
import { loadHeroes, loadIndex, loadNames, loadRta } from '../src/lib/data';

vi.mock('../src/lib/guides', async () => (await import('./sampleGuides')).guidesModule());
vi.mock('../src/lib/data', async (orig) => ({ ...(await orig<typeof import('../src/lib/data')>()), loadRta: vi.fn(), loadIndex: vi.fn(), loadHeroes: vi.fn(), loadNames: vi.fn() }));

beforeEach(() => {
  vi.mocked(loadIndex).mockResolvedValue(null);
  vi.mocked(loadHeroes).mockResolvedValue([]);
  vi.mocked(loadNames).mockResolvedValue(null);
  vi.mocked(loadRta).mockResolvedValue(null);
});
afterEach(() => { cleanup(); location.hash = ''; vi.resetAllMocks(); });

describe('ToolsPage', () => {
  it('lists the draft simulator with a link to it', () => {
    render(<ToolsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Tools' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'RTA draft simulator' }).getAttribute('href')).toBe('#/tools/draft');
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#/tools/draft');
  });
});

describe('the Tools routes', () => {
  const nav = () => within(screen.getByRole('navigation', { name: 'Main' }));
  it('opens the tools page from #/tools, with Tools marked in the menu', () => {
    location.hash = '#/tools';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Tools' })).toBeTruthy();
    expect(nav().getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page');
  });
  it('opens the draft simulator from #/tools/draft, with Tools still marked', async () => {
    location.hash = '#/tools/draft';
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: 'RTA draft simulator' })).toBeTruthy();
    expect(nav().getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page');
  });
});
