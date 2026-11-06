import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modeOf, refreshLimited } from '../scripts/collect/limited';
import type { createClient } from '../scripts/collect/api';

const post = (id: number, title: string, iso: string) => ({ article_id: String(id), title, create_datetime: Date.parse(iso) });
const envelope = (list: unknown[]) => ({ code: 0, message: 'ok', value: { list } });

describe('modeOf', () => {
  it('finds the mode a post title names, whatever the case', () => {
    expect(modeOf('Otherworld Breach Season 3 Full Buff Event')).toBe('otherworld-breach');
    expect(modeOf('raid labyrinth removal & launch of Trial of the Constellations')).toBe('trial-of-the-constellations');
    expect(modeOf('Strategic Archive: new stage')).toBe('strategic-archive');
    expect(modeOf('Automaton Tower rewards')).toBe('automaton-tower');
    expect(modeOf('Rift season 6 begins')).toBe('rift');
  });
  it('is not fooled by a hero called Tidal Rift Elvira, by the Otherworldly Hunt, or by a shop notice about the Rift', () => {
    expect(modeOf("Tidal Rift Elvira's Beneath the Deep Waves Special Event")).toBeUndefined();
    expect(modeOf('Fall Full Buff Event & Otherworldly Hunt Pack Sale Notice')).toBeUndefined();
    expect(modeOf('"Rift Challenge Pack – Robin" Sale End Date Rescheduled')).toBeUndefined();
    expect(modeOf('11/5 (Thu) Patch Information')).toBeUndefined();
  });
});

describe('refreshLimited', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'limited-')); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  // board id -> pages of posts; a board that is not listed fails
  const clientOf = (boards: Record<string, unknown[][]>) => ({
    get: async (path: string, params: Record<string, string>) => {
      const id = path.match(/BOARD\/(\d+)\//)![1];
      if (!boards[id]) throw new Error('down');
      return envelope(boards[id][Number(params.page) - 1] ?? []);
    },
  }) as unknown as ReturnType<typeof createClient>;
  const read = () => JSON.parse(readFileSync(join(dir, 'limited.json'), 'utf8'));

  it('keeps for each mode its newest posts (three at most), over every page of every board', async () => {
    const client = clientOf({
      '985': [[post(1, 'Maintenance', '2026-11-01T00:00:00Z')]],
      '986': [[]], '987': [[]],
      '988': [
        [post(9, 'Otherworld Breach Season 4 Full Buff Event', '2026-10-01T00:00:00Z'), post(8, 'Otherworld Breach Season 3 Full Buff Event', '2026-06-03T00:00:00Z')],
        [post(7, 'Otherworld Breach Season 2 Full Buff Event', '2026-02-01T00:00:00Z'), post(6, 'Otherworld Breach Season 1 Full Buff Event', '2025-10-01T00:00:00Z')],
      ],
    });
    expect(await refreshLimited({ outDir: dir, client, now: () => '2026-11-06' })).toBe('written');
    const out = read();
    expect(out.updated).toBe('2026-11-06');
    expect(out.modes['otherworld-breach'].map((p: { id: string }) => p.id)).toEqual(['9', '8', '7']);
    expect(out.modes['otherworld-breach'][0]).toMatchObject({ board: 'event', date: '2026-10-01', url: 'https://page.onstove.com/epicseven/global/view/9' });
    expect(Object.keys(out.modes)).toEqual(['otherworld-breach']); // a mode with no post has no entry
  });

  it('keeps the posts found earlier when the boards are down or the post has scrolled out of the pages', async () => {
    const old = { updated: '2026-10-01', modes: { 'automaton-tower': [{ id: '5', board: 'notice', title: 'Automaton Tower rewards', date: '2026-09-01', url: 'u' }] } };
    writeFileSync(join(dir, 'limited.json'), JSON.stringify(old));
    expect(await refreshLimited({ outDir: dir, client: clientOf({ '988': [[]] }) })).toBe('written'); // three boards fail, one is empty
    expect(read().modes['automaton-tower']).toHaveLength(1);
  });

  it('fails only when no board could be read and there is no earlier file', async () => {
    expect(await refreshLimited({ outDir: dir, client: clientOf({}) })).toBe('failed');
  });
});
