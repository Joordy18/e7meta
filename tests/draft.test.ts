import { describe, expect, it } from 'vitest';
import { PRE_BANS, PROTECTED_SLOT, botBan, botPick, botPreBans, mulberry32, pickSides, rarityOf, scoreDraft } from '../src/lib/draft';
import type { RtaRow } from '../src/lib/rta';

const row = (code: string, pick: number, win: number | null, ban = 0, preban = 0): RtaRow => ({ code, pick, win, ban, preban, first: 0, played: 100 });
// 12 heroes: a is the most picked, l the least
const pool: RtaRow[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'].map((c, i) => row(c, 60 - i * 5, 50 + (i % 3), 10 - i * 0.5, 40 - i * 3));

describe('pickSides', () => {
  it('gives the side that picks first turns 1, 4, 5, 8 and 9, and the other 2, 3, 6, 7 and 10', () => {
    expect(pickSides(true)).toEqual(['you', 'bot', 'bot', 'you', 'you', 'bot', 'bot', 'you', 'you', 'bot']);
    expect(pickSides(false)).toEqual(['bot', 'you', 'you', 'bot', 'bot', 'you', 'you', 'bot', 'bot', 'you']);
    for (const youFirst of [true, false]) expect(pickSides(youFirst).filter((s) => s === 'you')).toHaveLength(5);
  });
});

describe('rarityOf', () => {
  it('sorts a hero by how often it is picked: meta from 20%, mainstream from 8%, off-meta from 2%, rare below', () => {
    expect([25, 20, 19.9, 8, 7.9, 2, 1.9, 0].map(rarityOf)).toEqual(['meta', 'meta', 'mainstream', 'mainstream', 'offmeta', 'offmeta', 'rare', 'rare']);
  });
});

describe('the bot', () => {
  it('plays the same game from the same seed, and another one from another seed', () => {
    const play = (seed: number) => { const rng = mulberry32(seed); return [botPick(pool, new Set(), rng), botPick(pool, new Set(), rng), botPick(pool, new Set(), rng)]; };
    expect(play(1)).toEqual(play(1));
    expect(new Set([1, 2, 3, 4, 5, 6].map((s) => play(s).join()))).not.toHaveProperty('size', 1);
  });

  it('never picks a hero that is not available, and mostly takes the most picked ones', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 400; seed++) {
      const gone = new Set(['a', 'b']);
      const c = botPick(pool, gone, mulberry32(seed));
      expect(gone.has(c)).toBe(false);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(counts.get('c')!).toBeGreaterThan(counts.get('h') ?? 0); // c is picked 4 times as often as h in the pool
    expect(counts.get('l') ?? 0).toBe(0); // the bot only draws among the top of the most picked
  });

  it('pre-bans two different heroes among the six most pre-banned ones, blind to what the other side chose', () => {
    for (let seed = 0; seed < 100; seed++) {
      const out = botPreBans(pool, mulberry32(seed));
      expect(out).toHaveLength(PRE_BANS);
      expect(new Set(out).size).toBe(PRE_BANS);
      for (const c of out) expect(['a', 'b', 'c', 'd', 'e', 'f']).toContain(c); // the six best by pre-ban rate
    }
  });

  it('bans the hero of your team with the best win rate', () => {
    const p = [row('p', 10, 49), row('q', 10, 56), row('r', 10, 52), row('s', 10, 51), row('t', 10, 50)];
    expect(botBan(p, ['p', 'q', 'r', 's', 't'])).toBe('q');
    expect(botBan(p, ['p', 'r', 'q', 's', 't'])).toBe('r'); // the third pick (q here) is protected: the next best is banned
  });

  it('never bans the protected third pick, whatever its win rate', () => {
    const p = [row('p', 10, 40), row('q', 10, 41), row('r', 10, 70), row('s', 10, 42), row('t', 10, 43)];
    expect(PROTECTED_SLOT).toBe(2);
    expect(botBan(p, ['p', 'q', 'r', 's', 't'])).toBe('t');
  });

  it('can still choose when few heroes are left', () => {
    const left = new Set(pool.map((r) => r.code).filter((c) => c !== 'k'));
    expect(botPick(pool, left, mulberry32(3))).toBe('k');
  });
});

describe('scoreDraft', () => {
  // you: a b c d e (the banned one: c); bot: f g h i j (the banned one: g)
  const p = [
    row('a', 60, 54), row('b', 30, 52), row('c', 10, 58), row('d', 5, 50), row('e', 1, 47),
    row('f', 40, 49), row('g', 20, 56), row('h', 8, 51), row('i', 4, 48), row('j', 2, 50), row('x', 15, 50, 0, 90), row('y', 5, 50, 0, 10),
  ];
  const draft = { you: ['a', 'b', 'c', 'd', 'e'], bot: ['f', 'g', 'h', 'i', 'j'], youBan: 'g', botBan: 'c', youPreBans: ['x', 'y'] };
  const r = scoreDraft(p, draft);

  it('compares the average win rate of the heroes that play: the banned ones are left out of their side', () => {
    expect(r.you.avgWin).toBe(50.75); // a b d e = (54 + 52 + 50 + 47) / 4
    expect(r.bot.avgWin).toBe(49.5); // f h i j = (49 + 51 + 48 + 50) / 4
  });

  it('gives a score of 50 plus ten points per point of advantage, between 0 and 100', () => {
    expect(r.score).toBe(63); // 50 + (50.75 - 49.5) * 10 = 62.5, rounded
    expect(scoreDraft(p, { ...draft, you: ['e', 'e', 'e', 'e', 'e'], bot: ['c', 'c', 'c', 'c', 'c'], botBan: 'zz', youBan: 'zz' }).score).toBe(0);
    expect(scoreDraft(p, { ...draft, you: ['c', 'c', 'c', 'c', 'c'], bot: ['e', 'e', 'e', 'e', 'e'], botBan: 'zz', youBan: 'zz' }).score).toBe(100);
  });

  it('describes the style of a draft by the typical pick rate of its five heroes (geometric mean)', () => {
    expect(r.you.typicalPick).toBeCloseTo(Math.pow(60 * 30 * 10 * 5 * 1, 1 / 5), 1);
    expect(r.you.style).toBe(rarityOf(r.you.typicalPick));
    expect(r.bot.style).toBe(rarityOf(r.bot.typicalPick));
  });

  it('ranks your ban among the four heroes you could have banned, by win rate (1 = the best target)', () => {
    // the bot team is f g h i j and its third pick, h, is protected: f 49, g 56, i 48, j 50 can be banned
    expect(r.banRank).toBe(1); // g has the best win rate
    expect(scoreDraft(p, { ...draft, youBan: 'j' }).banRank).toBe(2);
    expect(scoreDraft(p, { ...draft, youBan: 'i' }).banRank).toBe(4);
    expect(r.bannable).toBe(4);
  });

  it('has no rank for a ban on the protected hero (the game does not allow it), nor on a hero that is not in the team', () => {
    expect(scoreDraft(p, { ...draft, youBan: 'h' }).banRank).toBeNull();
    expect(scoreDraft(p, { ...draft, youBan: 'zz' }).banRank).toBeNull();
  });

  it('ranks the ban of the other side too, and its pre-bans when given', () => {
    // your team is a b c d e, the protected one is c; the bot banned c in the draft above, so give it a legal ban
    const out = scoreDraft(p, { ...draft, botBan: 'a', botPreBans: ['y', 'x'] });
    expect(out.botBanRank).toBe(1); // a 54 is the best win rate of a b d e
    expect(scoreDraft(p, { ...draft, botBan: 'e' }).botBanRank).toBe(4);
    expect(out.botPreBanRanks).toEqual([{ code: 'y', rank: 2 }, { code: 'x', rank: 1 }]);
    expect(r.botPreBanRanks).toEqual([]); // not given: none
  });

  it('ranks each pre-ban among all heroes by pre-ban rate', () => {
    expect(r.preBanRanks).toEqual([{ code: 'x', rank: 1 }, { code: 'y', rank: 2 }]);
  });

  it('copes with heroes without a win rate', () => {
    const q = [row('a', 10, null), row('b', 10, 55)];
    const out = scoreDraft(q, { you: ['a', 'b'], bot: ['a', 'b'], youBan: 'a', botBan: 'a', youPreBans: [] });
    expect(out.you.avgWin).toBe(55);
    expect(Number.isFinite(out.score)).toBe(true);
  });
});
