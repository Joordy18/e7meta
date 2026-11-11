import { setsText, type Resolved } from './card';

export type Pic = { src: string; w: number; h: number }; // a data: URI and its size
export type Images = { sheet: Pic | null; portrait: Pic | null; sets: Record<string, Pic | null>; artifact: Pic | null }; // null when the picture could not be fetched
type Style = Record<string, string | number>;
type El = { type: string; props: { style?: Style; children?: unknown; src?: string; width?: number; height?: number } };

const C = { ink: '#0c1018', panel: '#141a26', raise: '#1b2332', line: '#26304a', text: '#e7ebf4', mute: '#8893ad', gold: '#f2b84b' };
const el = (type: string, style: Style, children?: unknown, extra: Partial<El['props']> = {}): El => ({ type, props: { style, children, ...extra } });
const text = (s: string, style: Style) => el('div', { display: 'flex', ...style }, s);
const img = (src: string, w: number, h: number, style: Style = {}) => el('img', { width: w, height: h, objectFit: 'contain', ...style }, undefined, { src, width: w, height: h });
// The element and class icons are cut out of the game's guide sheet (460 x 260), at the boxes site/src/styles.css uses.
const ELEMENT_Y: Record<string, number> = { dark: 0, fire: 54, ice: 106, wind: 159, light: 212 };
const JOB_X: Record<string, number> = { mage: 52, knight: 99, assassin: 145, ranger: 192, manauser: 236, warrior: 283 };
const SCALE = 1.15;
const sprite = (sheet: Pic, x: number, y: number, w: number, h: number) =>
  el('div', { display: 'flex', position: 'relative', width: w * SCALE, height: h * SCALE, overflow: 'hidden' },
    el('img', { position: 'absolute', left: -x * SCALE, top: -y * SCALE, width: 460 * SCALE, height: 260 * SCALE }, undefined, { src: sheet.src, width: 460 * SCALE, height: 260 * SCALE }));
/** `grade` gold stars, drawn as a picture (the card font has no star). */
const stars = (grade: number) => {
  const star = '<polygon points="12,1.5 15,9 23,9.5 17,14.5 19,22.5 12,18 5,22.5 7,14.5 1,9.5 9,9" fill="#f2b84b"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${grade * 28}" height="28" viewBox="0 0 ${grade * 28} 28">${Array.from({ length: grade }, (_, i) => `<g transform="translate(${i * 28 + 2} 2)">${star}</g>`).join('')}</svg>`;
  return img(`data:image/svg+xml;base64,${btoa(svg)}`, grade * 28, 28);
};

const FACE = 400;
/** The face of a full-length portrait: the same framing as the site (a picture 3.5 times the square, centred a third of the way up). */
const face = (p: Pic) => {
  const w = FACE * 3.5, h = (w * p.h) / p.w;
  return el('img', { position: 'absolute', left: (FACE - w) / 2, top: FACE / 2 - 0.33 * h, width: w, height: h }, undefined, { src: p.src, width: w, height: h });
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The 1200 x 630 card of a build, as a tree satori (inside @vercel/og) can draw: a hero, its sets, its artifact and a note. */
export function cardLayout(r: Resolved, images: Images): El {
  const rows: El[] = [];
  if (r.sets.length > 0) {
    rows.push(el('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
      ...r.sets.map(([code]) => images.sets[code] ? img(images.sets[code]!.src, 56, 56) : null).filter(Boolean),
      text(setsText(r), { fontSize: 34, fontWeight: 700 }),
    ]));
  }
  if (r.artifact) {
    rows.push(el('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
      images.artifact ? img(images.artifact.src, 56, 56) : null,
      text(r.artifact.name, { fontSize: 34, fontWeight: 700 }),
    ].filter(Boolean)));
  }
  return el('div', { display: 'flex', width: 1200, height: 630, padding: 48, background: C.ink, color: C.text, gap: 44 }, [
    el('div', { display: 'flex', alignItems: 'center' }, el('div', { display: 'flex', position: 'relative', width: FACE, height: FACE, borderRadius: 24, border: `2px solid ${C.line}`, background: C.raise, overflow: 'hidden' },
      images.portrait ? face(images.portrait) : text(r.name.slice(0, 2), { fontSize: 120, margin: 'auto' }))),
    el('div', { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }, [
      el('div', { display: 'flex', flexDirection: 'column', gap: 22 }, [
        text(r.name, { fontSize: 66, fontWeight: 700, lineHeight: 1.05 }),
        el('div', { display: 'flex', alignItems: 'center', gap: 18 }, images.sheet && r.element in ELEMENT_Y && r.job in JOB_X
          ? [stars(r.grade), sprite(images.sheet, 0, ELEMENT_Y[r.element], 41, 41), sprite(images.sheet, JOB_X[r.job], 0, 44, 42)]
          : [text(`${r.grade}-star · ${cap(r.job)} · ${cap(r.element)}`, { fontSize: 28, color: C.mute })]),
        ...rows,
        r.note ? text(r.note, { fontSize: 30, color: C.text, lineHeight: 1.3, marginTop: 6, padding: '14px 18px', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, lineClamp: 3 }) : null,
      ].filter(Boolean)),
      text('E7 Meta · build maker', { fontSize: 24, color: C.gold }),
    ]),
  ]);
}
