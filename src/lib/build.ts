/** A build someone puts together for one hero: what the shared link carries (no account, no server). */
export type Build = { hero: string; sets: string[]; artifact: string; note: string };

export const MAX_SETS = 3; // a hero wears six pieces: 4 + 2, 2 + 2 + 2, or one set
export const NOTE_MAX = 140;
// The game's gear sets, in the order of names/<lang>.json. shortcut: a set the game adds later is added here by hand.
export const SETS = [
  'set_speed', 'set_max_hp', 'set_cri', 'set_immune', 'set_penetrate', 'set_acc', 'set_att', 'set_cri_dmg', 'set_res', 'set_def', 'set_counter', 'set_vampire',
  'set_scar', 'set_shield', 'set_torrent', 'set_chase', 'set_revenge', 'set_coop', 'set_might', 'set_weak', 'set_opener', 'set_rage', 'set_revenant', 'set_riposte',
];

export const EMPTY: Build = { hero: '', sets: [], artifact: '', note: '' };
const CODE = /^[a-z0-9_]{1,32}$/i; // hero, artifact and set codes: anything else in an address is dropped

const code = (v: string | null | undefined) => (v && CODE.test(v) ? v : '');

/** The build in `#/tools/build?h=c1007&s=set_speed,set_cri&a=efa17&n=text`; whatever is missing or not valid is left empty. */
export function parseBuild(hash: string): Build {
  const p = new URLSearchParams(hash.split('?')[1] ?? '');
  const sets = [...new Set((p.get('s') ?? '').split(',').filter((c) => CODE.test(c)))].slice(0, MAX_SETS);
  return { hero: code(p.get('h')), sets, artifact: code(p.get('a')), note: (p.get('n') ?? '').slice(0, NOTE_MAX) };
}

/** The address of a build: only what is filled in. */
export function buildHash(b: Build): string {
  const q = [b.hero && `h=${b.hero}`, b.sets.length > 0 && `s=${b.sets.join(',')}`, b.artifact && `a=${b.artifact}`, b.note && `n=${encodeURIComponent(b.note)}`].filter(Boolean).join('&');
  return `#/tools/build${q ? `?${q}` : ''}`;
}

/** "set_cri_dmg" -> "Cri Dmg Set": only for a set whose English name is not in the data. */
export const setFallbackName = (setCode: string) => `${setCode.replace(/^set_/, '').split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} Set`;
