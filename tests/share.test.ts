import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { SETS, parseBuild, shareLink } from '../src/lib/build';
import { SETS as SERVER_SETS, cardQuery, parseCard, previewPage, resolve, setsText, siteLink } from '../share/lib/card';
import { cardLayout } from '../share/lib/layout';

const json = async (p: string) => JSON.parse(await readFile(`public/${p}`, 'utf8')); // from the project root, where vitest runs

describe('share preview', () => {
  it('reads an address like the site does (same hero, artifact, note and sets for the addresses the site can write)', () => {
    for (const q of ['h=c1137&s=set_speed,set_max_hp,set_max_hp&a=efk03&n=Hello%20there', 'h=c1137', 'h=%3Cb%3E&a=../x', 's=set_speed,set_cri,set_def']) {
      const mine = parseBuild(`#/tools/build?${q}`);
      const theirs = parseCard(new URLSearchParams(q));
      expect({ hero: theirs.hero, artifact: theirs.artifact, note: theirs.note }).toEqual({ hero: mine.hero, artifact: mine.artifact, note: mine.note });
      expect(theirs.sets.length).toBeGreaterThanOrEqual(mine.sets.length); // the site also drops sets that do not fit six pieces
    }
    expect(parseCard(new URLSearchParams('l=ja')).lang).toBe('en'); // the card font has Latin letters only
    expect(parseCard(new URLSearchParams('n=' + 'a'.repeat(500))).note).toHaveLength(140);
  });

  it('reads the short link the site writes, and the older full one', () => {
    expect(SERVER_SETS).toEqual(SETS); // a set's letter is its place in the list, on both sides
    const b = { hero: 'c1137', sets: ['set_speed', 'set_max_hp', 'set_riposte'], artifact: 'efk03', note: 'Speed 190+ & more' };
    for (const lang of ['en', 'fr']) {
      const link = shareLink('https://share.example.app', b, lang);
      expect(parseCard(new URL(link).searchParams)).toEqual({ ...b, lang });
    }
    expect(parseCard(new URLSearchParams('s=set_speed,set_cri')).sets).toEqual(['set_speed', 'set_cri']);
    expect(parseCard(new URLSearchParams('s=a!zc')).sets).toEqual(['set_speed', 'set_cri']); // what is not a set's letter is dropped
  });

  it('only knows real sets, and writes the card address from what it understood (extra parameters change nothing)', async () => {
    expect(parseCard(new URLSearchParams('s=set_speed,set_nope,set_cri')).sets).toEqual(['set_speed', 'set_cri']);
    const a = parseCard(new URLSearchParams('h=c1137&s=set_speed&x=1&junk=2&n=Hi'));
    const b = parseCard(new URLSearchParams('n=Hi&h=c1137&s=a&y=3'));
    expect(cardQuery(a)).toBe('h=c1137&s=a&n=Hi');
    expect(cardQuery(a)).toBe(cardQuery(b));
    const r = await resolve(parseCard(new URLSearchParams('h=c1137&a=constructor')), json);
    expect(r?.artifact).toBeNull(); // an object's own key is not an artifact
  });

  it('cuts the note by characters: a half emoji would make the redirect address impossible to write', () => {
    const c = parseCard(new URLSearchParams('h=c1&n=' + 'a'.repeat(139) + '%F0%9F%98%80%F0%9F%98%80'));
    expect([...c.note]).toHaveLength(140);
    expect(() => siteLink('https://x.test/', c)).not.toThrow();
  });

  it('sends a person to the same build on the site', () => {
    const c = parseCard(new URLSearchParams('h=c1137&s=set_speed&a=efk03&n=Speed%20190%2B'));
    expect(siteLink('https://x.test/e7meta/', c)).toBe('https://x.test/e7meta/#/tools/build?h=c1137&s=set_speed&a=efk03&n=Speed%20190%2B');
    expect(siteLink('https://x.test/', parseCard(new URLSearchParams('')))).toBe('https://x.test/#/tools/build');
  });

  it('names the hero, sets and artifact from the site data, in French when asked, and knows an unknown hero', async () => {
    const en = await resolve(parseCard(new URLSearchParams('h=c1137&s=set_speed,set_max_hp,set_max_hp&a=efk03')), json);
    expect(en?.name).toBe('ae-KARINA');
    expect(setsText(en!)).toBe('Speed Set + Max HP Set ×2'.replace('Max HP', en!.sets[1][1].replace(' Set', '')));
    expect(en?.artifact?.name).toBe('Aurius');
    const fr = await resolve(parseCard(new URLSearchParams('h=c1137&s=set_speed&l=fr')), json);
    expect(fr?.sets[0][1]).toBe('Set Vitesse');
    expect(await resolve(parseCard(new URLSearchParams('h=nope')), json)).toBeNull();
    expect(await resolve(parseCard(new URLSearchParams('')), json)).toBeNull();
  });

  it('writes a preview page where nothing typed by a person can break out, and draws the card from the same data', async () => {
    const html = previewPage({ title: 'T "x"', description: '<script>alert(1)</script> & more', image: 'https://i.test/a.png?x=1&y=2', target: 'https://s.test/#/a?b=1&c="2"', url: 'https://p.test/b' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('og:image" content="https://i.test/a.png?x=1&#38;y=2"');
    expect(html).toContain('summary_large_image');
    expect(html).toContain('http-equiv="refresh" content="0;url=https://s.test/#/a?b=1&#38;c=&#34;2&#34;"');
    const r = await resolve(parseCard(new URLSearchParams('h=c1137&s=set_speed&n=A%20note')), json);
    const tree = JSON.stringify(cardLayout(r!, { sheet: null, portrait: null, sets: {}, artifact: null }));
    expect(tree).toContain('ae-KARINA');
    expect(tree).toContain('A note');
  });
});
