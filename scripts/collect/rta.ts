import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient, unwrap } from './api';
import type { RtaHeroCount, RtaStats } from '../../src/shared/types';

type Client = ReturnType<typeof createClient>;

// The game's public record API (the one behind the player rankings and match histories of epic7.onstove.com), asked with our own identity.
const BASE = 'https://e7api.onstove.com';
const PLAYERS = 100; // top of the global leaderboard
const BATTLES = 100; // most recent battles per player (the API keeps 100)
const PAGE = 10; // rows per page, fixed by the API
const MIN_PLAYERS_OK = 0.8; // below this share of players loaded, the sample is too thin to publish

export type Deck = { heroes: { code: string; first: boolean; ban: boolean }[]; prebans: string[]; won: boolean };
export type Battle = { seq: string; season: string; decks: Deck[] };

type RawDeck = { hero_list?: { hero_code: string; first_pick?: number; ban?: number }[]; preban_list?: string[] };
type RawBattle = { battle_seq?: string | number; iswin?: number; season_code?: string; my_deck?: RawDeck; enemy_deck?: RawDeck };

/** One battle seen from the player's side: both drafts, who won (iswin: 1 = win, 2 = loss). Null when it has no id or no draft. */
export function parseBattle(raw: RawBattle): Battle | null {
  if (!raw.battle_seq || !raw.my_deck?.hero_list?.length || !raw.enemy_deck?.hero_list?.length) return null;
  const won = raw.iswin === 1;
  const deck = (d: RawDeck, w: boolean): Deck => ({
    heroes: (d.hero_list ?? []).map((h) => ({ code: h.hero_code, first: h.first_pick === 1, ban: h.ban === 1 })),
    prebans: d.preban_list ?? [],
    won: w,
  });
  return { seq: String(raw.battle_seq), season: raw.season_code ?? '', decks: [deck(raw.my_deck, won), deck(raw.enemy_deck, !won)] };
}

/** Counts per hero over battles (see RtaHeroCount). A hero pre-banned in several lists of a battle counts once. */
export function tally(battles: Battle[]): Record<string, RtaHeroCount> {
  const out: Record<string, RtaHeroCount> = {};
  const at = (code: string) => (out[code] ??= { pick: 0, played: 0, win: 0, first: 0, ban: 0, preban: 0 });
  for (const b of battles) {
    for (const d of b.decks) {
      for (const h of d.heroes) {
        const c = at(h.code);
        c.pick++;
        if (h.first) c.first++;
        if (h.ban) c.ban++;
        else { c.played++; if (d.won) c.win++; }
      }
    }
    for (const code of new Set(b.decks.flatMap((d) => d.prebans))) at(code).preban++;
  }
  return out;
}

/** The players of a ranking page; names are not kept. */
export function listPlayers(raw: unknown): { nick: number; world: string }[] {
  const rows = unwrap<{ result_body?: { nick_no: number; world_code: string }[] }>(raw).result_body ?? [];
  return rows.map((r) => ({ nick: r.nick_no, world: r.world_code }));
}

/**
 * Samples the recent battles of the top players for the current season and writes the counts to rta/stats.json (no names, no battle ids).
 * One request at a time through the client's delay. 'failed' when no battle was found or too many players could not be loaded.
 */
export async function collectRta(opts: {
  outDir: string; client: Client; players?: number; battles?: number; log?: (m: string) => void; now?: () => string;
}): Promise<'written' | 'failed'> {
  const { outDir, client, players = PLAYERS, battles: perPlayer = BATTLES, log = () => {}, now = () => new Date().toISOString().slice(0, 10) } = opts;
  const lang = { lang: 'en' };
  let season: { season_code: string; name: string };
  try {
    const seasons = unwrap<{ result_body: { season_code: string; name: string; is_now_season: number }[] }>(await client.get('/gameApi/getSeasonList', lang)).result_body;
    season = seasons.find((s) => s.is_now_season === 1) ?? seasons[0];
  } catch (e) {
    log(`rta: could not read the season list: ${(e as Error).message}`);
    return 'failed';
  }

  const ranked: { nick: number; world: string }[] = [];
  try {
    for (let page = 1; ranked.length < players; page++) {
      const rows = listPlayers(await client.get('/gameApi/getWorldUserRankingDetail', { season_code: season.season_code, world_code: 'all', current_page: String(page), ...lang }));
      if (rows.length === 0) break;
      for (const r of rows) if (!ranked.some((x) => x.nick === r.nick && x.world === r.world)) ranked.push(r);
    }
  } catch (e) {
    log(`rta: could not read the ranking: ${(e as Error).message}`);
    if (ranked.length === 0) return 'failed';
  }
  ranked.length = Math.min(ranked.length, players);

  const seen = new Map<string, Battle>();
  let failed = 0;
  for (const p of ranked) {
    try {
      let got = 0;
      for (let page = 1; got < perPlayer; page++) {
        const body = unwrap<{ result_body: { total_count: number; battle_list: RawBattle[] } }>(
          await client.get('/gameApi/getBattleList', { nick_no: String(p.nick), world_code: p.world, current_page: String(page), ...lang }),
        ).result_body;
        const list = body.battle_list ?? [];
        const current = list.map(parseBattle).filter((b): b is Battle => b !== null && b.season === season.season_code);
        for (const b of current) if (!seen.has(b.seq)) seen.set(b.seq, b);
        got += list.length;
        if (list.length === 0 || current.length === 0 || page * PAGE >= body.total_count) break; // no more, or the page is already from an older season
      }
    } catch (e) {
      failed++;
      log(`rta: a player failed: ${(e as Error).message}`);
    }
  }
  if (ranked.length === 0 || (ranked.length - failed) / ranked.length < MIN_PLAYERS_OK) {
    log(`rta: too many players failed (${failed} of ${ranked.length}), nothing written`);
    return 'failed';
  }
  if (seen.size === 0) {
    log('rta: no battle of the current season found, nothing written');
    return 'failed';
  }

  const stats: RtaStats = { season: season.name, code: season.season_code, updated: now(), players: ranked.length - failed, battles: seen.size, heroes: tally([...seen.values()]) };
  await mkdir(join(outDir, 'rta'), { recursive: true });
  await writeFile(join(outDir, 'rta', 'stats.json'), JSON.stringify(stats));
  log(`rta: ${stats.battles} battles from ${stats.players} players, ${Object.keys(stats.heroes).length} heroes`);
  return 'written';
}

// shortcut: argv[1] compare only works for `tsx scripts/collect/rta.ts`; fine for npm run rta
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // the record API takes POST requests; the identity is ours, nothing is imitated; 700 ms between requests
  const post: typeof fetch = (url, init) => fetch(url, { ...init, method: 'POST', headers: { 'User-Agent': 'e7overlay-personal/0.1' } });
  const result = await collectRta({ outDir: 'public/data', client: createClient({ baseUrl: BASE, fetchFn: post, delayMs: 700 }), log: console.log });
  console.log(result);
  if (result === 'failed') process.exitCode = 1;
}
