import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import DataStatus, { daysAgo } from '../src/components/DataStatus';

vi.mock('../src/lib/data', () => ({
  loadIndex: vi.fn(async () => ({ periods: ['2026-10-29'] })),
  loadRta: vi.fn(async () => ({ updated: '2026-11-07', battles: 81000, players: 500, since: '2026-09-01', until: '2026-11-07' })),
  loadFeed: vi.fn(async () => ({ updated: new Date().toISOString().slice(0, 10) })),
  loadLimited: vi.fn(async () => { throw new Error('missing'); }),
}));

afterEach(cleanup);

describe('daysAgo', () => {
  it('counts whole days, 0 for today', () => {
    const now = Date.parse('2026-11-10T20:00:00Z');
    expect(daysAgo('2026-11-10', now)).toBe(0);
    expect(daysAgo('2026-11-07', now)).toBe(3);
  });
});

describe('DataStatus', () => {
  it('shows when each source was collected, marks a daily one that went quiet, and leaves out a file that is missing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    render(<DataStatus />);
    expect(await screen.findByText('Week of 2026-10-29')).toBeTruthy();
    expect(screen.getByText(/81,000 battles from 500 players/)).toBeTruthy();
    expect(screen.getByText('3 days ago: the collection may have failed')).toBeTruthy(); // RTA, collected on the 7th
    expect(screen.getAllByText(/Collected 2026-/).length).toBe(2); // RTA and posts; the limited-time modes file failed to load
    expect(screen.queryByText('Limited-time modes')).toBeNull();
    vi.useRealTimers();
  });
});
