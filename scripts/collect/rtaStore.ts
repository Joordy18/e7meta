import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type Deck = {
  heroes: { code: string; first: boolean; ban: boolean; artifact?: string; sets?: string[] }[];
  prebans: string[];
  won: boolean;
  tier?: string; // the league of the player on that side
};
/** One battle. `seqs`: every id the record API gave it (each of the two players has a record of it, with its own id). `date`: "YYYY-MM-DD HH:mm:ss". */
export type Battle = { seq: string; seqs?: string[]; season: string; date: string; decks: Deck[] };

const signature = (d: Deck) => d.heroes.map((h) => h.code).sort().join(',');

/** The same for the two records of one battle (seen from each side), different for any other battle. */
export const battleKey = (b: Battle) => `${b.date}|${[signature(b.decks[0]), signature(b.decks[1])].sort().join('/')}`;

export type Store = { path: string; battles: Battle[]; seqs: Set<string>; keys: Set<string> };

const remember = (store: Store, b: Battle) => {
  store.battles.push(b);
  for (const q of b.seqs ?? [b.seq]) store.seqs.add(q);
  store.keys.add(battleKey(b));
};

/**
 * The battles kept so far for a season: one JSON line each in <dir>/<season>.jsonl. It lives next to the data but outside public/ and git:
 * it is the raw material (decks, builds, leagues) of the statistics, which are what gets published.
 * A damaged line (a write cut short) is skipped, the rest is kept.
 */
export async function loadStore(dir: string, season: string): Promise<Store> {
  const store: Store = { path: join(dir, `${season}.jsonl`), battles: [], seqs: new Set(), keys: new Set() };
  let text = '';
  try { text = await readFile(store.path, 'utf8'); } catch { return store; }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const b = JSON.parse(line) as Battle;
      if (b && b.seq && Array.isArray(b.decks) && b.decks.length === 2) remember(store, { ...b, seqs: b.seqs ?? [b.seq] });
    } catch { /* damaged line */ }
  }
  return store;
}

/** Adds battles to the store, in memory and at the end of its file. */
export async function appendBattles(store: Store, fresh: Battle[]): Promise<void> {
  if (fresh.length === 0) return;
  const records = fresh.map((b) => ({ ...b, seqs: b.seqs ?? [b.seq] }));
  await mkdir(join(store.path, '..'), { recursive: true });
  await appendFile(store.path, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  for (const r of records) remember(store, r);
}
