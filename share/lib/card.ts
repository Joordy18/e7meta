/**
 * What a shared build link needs on the server: read the address, name the pieces from the site's public data, write the preview page.
 * shortcut: parseCard repeats the validation of src/lib/build.ts (this folder is deployed alone, so it cannot import it); tests/share.test.ts keeps the two in step.
 */
export const SITE = 'https://joordy18.github.io/e7meta/';
export const LANGS = ['en', 'fr', 'de'] as const; // the card font has Latin letters only: ja, ko and zh show English names
export type Lang = (typeof LANGS)[number];
export type Card = { hero: string; sets: string[]; artifact: string; note: string; lang: Lang };
export type Resolved = { code: string; name: string; grade: number; job: string; element: string; sets: [code: string, name: string, n: number][]; artifact: { code: string; name: string } | null; note: string };

const CODE = /^[a-z0-9_]{1,32}$/i;
const NOTE_MAX = 140;
const MAX_SETS = 6; // up to six pieces, so at most six listings

// The sets in the order of src/lib/build.ts, whose position is the letter a link uses for them ("ac" = set_speed, set_cri); a set added later goes at the end. tests/share.test.ts checks both lists are the same.
export const SETS = [
  'set_speed', 'set_max_hp', 'set_cri', 'set_immune', 'set_penetrate', 'set_acc', 'set_att', 'set_cri_dmg', 'set_res', 'set_def', 'set_counter', 'set_vampire',
  'set_scar', 'set_shield', 'set_torrent', 'set_chase', 'set_revenge', 'set_coop', 'set_might', 'set_weak', 'set_opener', 'set_rage', 'set_revenant', 'set_riposte',
];
const LETTERS = 'abcdefghijklmnopqrstuvwx';

/** The sets of a link: short letters ("aeb"), or the full codes separated by commas (the older links, and the site's own addresses). */
function parseSets(v: string): string[] {
  const list = v.startsWith('set_') ? v.split(',').filter((c) => SETS.includes(c)) : [...v].flatMap((ch) => (LETTERS.includes(ch) ? [SETS[LETTERS.indexOf(ch)]] : []));
  return list.slice(0, MAX_SETS);
}

const code = (v: string | null) => (v && CODE.test(v) ? v : '');

export function parseCard(q: URLSearchParams): Card {
  const lang = q.get('l') as Lang;
  return {
    hero: code(q.get('h')),
    sets: parseSets(q.get('s') ?? ''),
    artifact: code(q.get('a')),
    note: [...(q.get('n') ?? '')].slice(0, NOTE_MAX).join(''), // by characters, not UTF-16 units: a half emoji would make encodeURIComponent throw
    lang: LANGS.includes(lang) ? lang : 'en',
  };
}

/** The address of the card for this build: only what was understood, so a link with extra or odd parameters is the same card (and the same cache entry) as the plain one. */
export const cardQuery = (c: Card) =>
  [c.hero && `h=${c.hero}`, c.sets.length > 0 && `s=${c.sets.map((x) => LETTERS[SETS.indexOf(x)]).join('')}`, c.artifact && `a=${c.artifact}`, c.note && `n=${encodeURIComponent(c.note)}`, c.lang !== 'en' && `l=${c.lang}`].filter(Boolean).join('&');

/** The same build on the site (what a person is sent to). */
export function siteLink(site: string, c: Card): string {
  const q = [c.hero && `h=${c.hero}`, c.sets.length > 0 && `s=${c.sets.join(',')}`, c.artifact && `a=${c.artifact}`, c.note && `n=${encodeURIComponent(c.note)}`].filter(Boolean).join('&');
  return `${site}#/tools/build${q ? `?${q}` : ''}`;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fallbackSet = (c: string) => `${c.replace(/^set_/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} Set`;
export const setsText = (r: Resolved) => r.sets.map(([, name, n]) => name + (n > 1 ? ` ×${n}` : '')).join(' + ');

type Json = (path: string) => Promise<any>; // the site's data file, parsed (rejects when it is missing)

/** The hero, sets and artifact of a card, named from the site's data in the card's language; null when the hero is unknown. */
export async function resolve(c: Card, json: Json): Promise<Resolved | null> {
  if (!c.hero) return null;
  const period: string | undefined = (await json('data/index.json')).periods?.[0];
  if (!period) return null;
  const soft = (path: string) => json(path).catch(() => null);
  const [heroes, gear, builds, names] = await Promise.all([json(`data/${period}/heroes.json`), soft(`data/${period}/gear.json`), soft('data/rta/builds.json'), c.lang === 'en' ? null : soft(`data/names/${c.lang}.json`)]);
  const hero = (heroes as { code: string; name: string; grade: number; job: string; element: string }[]).find((h) => h.code === c.hero);
  if (!hero) return null;
  const counts = new Map<string, number>();
  for (const s of c.sets) counts.set(s, (counts.get(s) ?? 0) + 1);
  const art = c.artifact && Object.hasOwn(gear?.artifacts ?? {}, c.artifact) ? gear.artifacts[c.artifact] : undefined; // not 'constructor' and the like
  return {
    code: hero.code, grade: hero.grade, job: hero.job, element: hero.element,
    name: names?.heroes?.[hero.code] ?? hero.name,
    sets: [...counts].map(([s, n]) => [s, names?.sets?.[s] ?? builds?.setNames?.[s] ?? fallbackSet(s), n] as [string, string, number]),
    artifact: art ? { code: art.code, name: names?.artifacts?.[art.code] ?? art.name } : null,
    note: c.note,
  };
}

/** The page a chat app reads for its preview; a person is sent on to the site at once. Every value is escaped. */
export function previewPage(p: { title: string; description: string; image: string; /* empty: no card to show */ target: string; url: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(p.title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="website"><meta property="og:site_name" content="E7 Meta">
<meta property="og:title" content="${esc(p.title)}"><meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${esc(p.url)}">${p.image ? `<meta property="og:image" content="${esc(p.image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(p.image)}">` : '<meta name="twitter:card" content="summary">'}
<meta name="twitter:title" content="${esc(p.title)}"><meta name="twitter:description" content="${esc(p.description)}">
<meta http-equiv="refresh" content="0;url=${esc(p.target)}"></head>
<body><a href="${esc(p.target)}">${esc(p.title)}</a></body></html>`;
}
