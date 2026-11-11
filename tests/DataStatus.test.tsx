import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DataStatus, { daysAgo } from '../src/components/DataStatus';

const data = vi.hoisted(() => ({
  index: { periods: ['2026-10-29'] } as { periods: string[] } | Error,
  rta: { updated: '2026-11-07', battles: 81000, players: 500, since: '2026-09-01', until: '2026-11-07' } as Record<string, unknown> | Error,
  skills: { fetchedAt: '2026-11-09' } as Record<string, unknown> | Error,
  trends: { from: '2026-10-22', to: '2026-10-29' } as Record<string, unknown> | Error,
}));
const get = async <T,>(v: T | Error) => { if (v instanceof Error) throw v; return v; };
vi.mock('../src/lib/data', () => ({
  loadIndex: vi.fn(() => get(data.index)),
  loadRta: vi.fn(() => get(data.rta)),
  loadFeed: vi.fn(async () => ({ updated: new Date().toISOString().slice(0, 10) })),
  loadLimited: vi.fn(async () => { throw new Error('missing'); }),
  loadSkills: vi.fn(() => get(data.skills)),
  loadTrends: vi.fn(() => get(data.trends)),
  loadArenaIndex: vi.fn(async () => ({ seasons: [{ id: '1', season: 'Summer 2026', published: '2026-08-07', title: '', url: '' }] })),
  loadNames: vi.fn(async () => ({ lang: 'fr', updated: '2026-11-10', heroes: {}, artifacts: {}, sets: {} })),
}));

afterEach(cleanup);

describe('daysAgo', () => {
  it('counts whole days, 0 for today', () => {
    const now = Date.parse('2026-11-10T20:00:00Z');
    expect(daysAgo('2026-11-10', now)).toBe(0);
    expect(daysAgo('2026-11-07', now)).toBe(3);
  });
});

describe('daysAgo, a date that cannot be read', () => {
  it('counts as late, never as fresh', () => { expect(daysAgo('', Date.now())).toBe(Infinity); expect(daysAgo('soon') > 2).toBe(true); });
});

describe('DataStatus', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());

  it('shows when each source was collected, marks a daily one that went quiet, and leaves out a file that is missing', async () => {
    render(<DataStatus />);
    expect(await screen.findByText('Week of 2026-10-29')).toBeTruthy();
    expect(screen.getByText(/81,000 battles from 500 players/)).toBeTruthy();
    expect(screen.getByText('3 days ago: the collection may have failed')).toBeTruthy(); // RTA, collected on the 7th
    expect(screen.getAllByText(/Collected 2026-/).length).toBe(3); // RTA, posts and skills; the limited-time modes file failed to load
    expect(screen.queryByText('Limited-time modes')).toBeNull();
  });

  it('also shows the skills, the weekly changes and the arena season, and a language other than English its names', async () => {
    render(<DataStatus />);
    expect(await screen.findByText('Skill descriptions')).toBeTruthy();
    expect(screen.getByText('From the week of 2026-10-22 to the week of 2026-10-29')).toBeTruthy();
    expect(screen.getByText('Summer 2026, published 2026-08-07')).toBeTruthy();
    expect(screen.queryByText('Names in the chosen language')).toBeNull(); // English: the data's own names
  });

  it('marks a week that did not move for nine days, a quiet RTA, and trends behind the latest week', async () => {
    data.index = { periods: ['2026-10-29'] };
    vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
    data.rta = { updated: '2026-11-12', battles: 1000, players: 10, since: '2026-09-01', until: '2026-11-08' };
    data.trends = { from: '2026-10-15', to: '2026-10-22' };
    render(<DataStatus />);
    expect(await screen.findByText(/the latest battle counted was 4 days ago/)).toBeTruthy();
    expect(screen.getByText(/not updated since: the latest week is 2026-10-29/)).toBeTruthy();
    expect(screen.getByText('14 days old: the game has not published a newer week, or the collection missed it')).toBeTruthy(); // the week of the 29th, seen on the 12th
  });
});
