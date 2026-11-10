/** A build someone puts together for one hero: what the shared link carries (no account, no server). */
export type Build = { hero: string; sets: string[]; artifact: string; note: string };

export const MAX_PIECES = 6; // a hero wears six pieces: 4 + 2, 2 + 2 + 2, or 2 pieces of one set twice
export const NOTE_MAX = 140;
// The game's gear sets, in the order of names/<lang>.json. shortcut: a set the game adds later is added here by hand.
export const SETS = [
  'set_speed', 'set_max_hp', 'set_cri', 'set_immune', 'set_penetrate', 'set_acc', 'set_att', 'set_cri_dmg', 'set_res', 'set_def', 'set_counter', 'set_vampire',
  'set_scar', 'set_shield', 'set_torrent', 'set_chase', 'set_revenge', 'set_coop', 'set_might', 'set_weak', 'set_opener', 'set_rage', 'set_revenant', 'set_riposte',
];

// The sets that need four pieces; every other one needs two. shortcut: read from the sets the best RTA players wear (a 2-piece set shows in 2 + 2 + 2, a 4-piece one never next to another), a new set is added by hand.
const FOUR = new Set(['set_att', 'set_counter', 'set_cri_dmg', 'set_opener', 'set_rage', 'set_revenant', 'set_revenge', 'set_riposte', 'set_scar', 'set_shield', 'set_speed', 'set_vampire', 'set_weak']);
export const piecesOf = (setCode: string) => (FOUR.has(setCode) ? 4 : 2);
export const piecesUsed = (sets: string[]) => sets.reduce((n, c) => n + piecesOf(c), 0);

/** Like the game lists them: a set once each time it is complete, the four-piece ones first (a two-piece set twice means four pieces of it). */
export const addSet = (sets: string[], setCode: string) =>
  SETS.includes(setCode) && piecesUsed(sets) + piecesOf(setCode) <= MAX_PIECES ? [...sets, setCode].sort((a, b) => piecesOf(b) - piecesOf(a)) : sets;
export const removeSet = (sets: string[], setCode: string) => { const i = sets.indexOf(setCode); return i < 0 ? sets : sets.filter((_, j) => j !== i); };

export const EMPTY: Build = { hero: '', sets: [], artifact: '', note: '' };
const CODE = /^[a-z0-9_]{1,32}$/i; // hero, artifact and set codes: anything else in an address is dropped

const code = (v: string | null | undefined) => (v && CODE.test(v) ? v : '');

/** The build in `#/tools/build?h=c1007&s=set_speed,set_cri&a=efa17&n=text`; whatever is missing or not valid is left empty. */
export function parseBuild(hash: string): Build {
  const p = new URLSearchParams(hash.split('?')[1] ?? '');
  const sets = (p.get('s') ?? '').split(',').reduce(addSet, [] as string[]); // an address with more than six pieces keeps what fits
  return { hero: code(p.get('h')), sets, artifact: code(p.get('a')), note: (p.get('n') ?? '').slice(0, NOTE_MAX) };
}

/** The address of a build: only what is filled in. */
export function buildHash(b: Build): string {
  const q = [b.hero && `h=${b.hero}`, b.sets.length > 0 && `s=${b.sets.join(',')}`, b.artifact && `a=${b.artifact}`, b.note && `n=${encodeURIComponent(b.note)}`].filter(Boolean).join('&');
  return `#/tools/build${q ? `?${q}` : ''}`;
}

// Where the link preview is served (the `share/` folder, deployed on Vercel). Empty: "Copy link" gives the site's own address, which chat apps show without a picture.
export const SHARE_BASE = '';

/** The address to paste in a chat: it shows the card of the build as a preview, then sends whoever opens it to the site. `lang` is the one the card is written in. */
export function shareLink(base: string, b: Build, lang: string): string {
  const q = [b.hero && `h=${b.hero}`, b.sets.length > 0 && `s=${b.sets.join(',')}`, b.artifact && `a=${b.artifact}`, b.note && `n=${encodeURIComponent(b.note)}`, `l=${lang}`].filter(Boolean).join('&');
  return `${base.replace(/\/$/, '')}/b?${q}`;
}

/** "set_cri_dmg" -> "Cri Dmg Set": only for a set whose English name is not in the data. */
export const setFallbackName = (setCode: string) => `${setCode.replace(/^set_/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} Set`;
