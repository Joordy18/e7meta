import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Search from '../src/components/Search';
import { loadGear, loadHeroes, loadIndex, loadModes } from '../src/lib/data';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(), loadHeroes: vi.fn(), loadGear: vi.fn(), loadModes: vi.fn(),
}));

beforeEach(() => {
  location.hash = '';
  vi.mocked(loadIndex).mockResolvedValue({ periods: ['2026-10-29'] });
  vi.mocked(loadHeroes).mockResolvedValue([
    { code: 'c1', name: 'Setsuka', grade: 5, job: 'assassin', element: 'fire' },
    { code: 'c2', name: 'Abyssal Yufine', grade: 5, job: 'knight', element: 'dark' },
  ]);
  vi.mocked(loadGear).mockResolvedValue({ key: 'k', artifacts: { efk1: { code: 'efk1', name: 'Sword of Setting Sun', job: 'knight', grade: 5, attack: 1, health: 1, maxAttack: 1, maxHealth: 1, description: '', values: [], heroes: [] } } });
  vi.mocked(loadModes).mockResolvedValue({ key: 'k', lists: [{ id: 'hunt-1-13', mode: 'hunts', group: 'Golem Hunt', variant: 'Hell', title: 'Golem Hunt, Hell', heroes: [] }] });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); location.hash = ''; });

const open = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
const box = () => screen.findByRole('combobox', { name: /Search/ });
const type = async (text: string) => { fireEvent.change(await box(), { target: { value: text } }); };
const options = () => screen.queryAllByRole('option');

describe('Search', () => {
  it('is closed at first and opens with Ctrl+K, focusing the field', async () => {
    render(<Search />);
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    expect(await box()).toBe(document.activeElement);
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeTruthy();
  });

  it('also opens from its button, and with Cmd+K', async () => {
    render(<Search />);
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await box()).toBeTruthy();
    cleanup();
    render(<Search />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(await box()).toBeTruthy();
  });

  it('shows matching heroes, artifacts, modes and guides as you type, each with its kind', async () => {
    render(<Search />);
    open();
    await type('set');
    await waitFor(() => expect(options().length).toBeGreaterThan(1));
    const text = options().map((o) => o.textContent);
    expect(text.some((t) => t?.includes('Setsuka') && t.includes('Hero'))).toBe(true);
    expect(text.some((t) => t?.includes('Sword of Setting Sun') && t.includes('Artifact'))).toBe(true);
    await type('golem');
    await waitFor(() => expect(options().map((o) => o.textContent).some((t) => t?.includes('Golem Hunt') && t.includes('Mode'))).toBe(true));
    await type('read the build');
    await waitFor(() => expect(options().some((o) => /Guide/.test(o.textContent ?? ''))).toBe(true));
  });

  it('goes to the highlighted result with Enter, moving the highlight with the arrow keys, and closes', async () => {
    render(<Search />);
    open();
    await type('yufine');
    await waitFor(() => expect(options()).toHaveLength(1));
    fireEvent.keyDown(await box(), { key: 'Enter' });
    expect(location.hash).toBe('#/hero/c2');
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    await type('s');
    await waitFor(() => expect(options().length).toBeGreaterThan(1));
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(await box(), { key: 'ArrowDown' });
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
    expect(options()[0].getAttribute('aria-selected')).toBe('false');
    fireEvent.keyDown(await box(), { key: 'ArrowUp' });
    expect(options()[0].getAttribute('aria-selected')).toBe('true');
  });

  it('links each result to its page and closes when one is clicked', async () => {
    render(<Search />);
    open();
    await type('setsuka');
    const link = await within(await screen.findByRole('option')).findByRole('link', { name: /Setsuka/ });
    expect(link.getAttribute('href')).toBe('#/hero/c1');
    fireEvent.click(link);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes with Escape or a click outside, and says when nothing matches', async () => {
    render(<Search />);
    open();
    await type('zzzz');
    expect(await screen.findByText(/No match/i)).toBeTruthy();
    fireEvent.keyDown(await box(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    open();
    await box();
    fireEvent.click(screen.getByTestId('search-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still finds pages and guides when the data cannot be loaded', async () => {
    vi.mocked(loadIndex).mockRejectedValue(new Error('down'));
    render(<Search />);
    open();
    await type('modes');
    await waitFor(() => expect(options().some((o) => o.textContent?.includes('Modes'))).toBe(true));
  });
});
