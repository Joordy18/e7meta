import { setsText, type Resolved } from './card';

export type Pic = { src: string; w: number; h: number }; // a data: URI and its size
export type Images = { portrait: Pic | null; sets: Record<string, Pic | null>; artifact: Pic | null }; // null when the picture could not be fetched
type Style = Record<string, string | number>;
type El = { type: string; props: { style?: Style; children?: unknown; src?: string; width?: number; height?: number } };

const C = { ink: '#0c1018', panel: '#141a26', raise: '#1b2332', line: '#26304a', text: '#e7ebf4', mute: '#8893ad', gold: '#f2b84b' };
const el = (type: string, style: Style, children?: unknown, extra: Partial<El['props']> = {}): El => ({ type, props: { style, children, ...extra } });
const text = (s: string, style: Style) => el('div', { display: 'flex', ...style }, s);
const img = (src: string, w: number, h: number, style: Style = {}) => el('img', { width: w, height: h, objectFit: 'contain', ...style }, undefined, { src, width: w, height: h });
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
        text(`${r.grade}-star · ${cap(r.job)} · ${cap(r.element)}`, { fontSize: 28, color: C.mute }),
        ...rows,
        r.note ? text(r.note, { fontSize: 30, color: C.text, lineHeight: 1.3, marginTop: 6, padding: '14px 18px', background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, lineClamp: 3 }) : null,
      ].filter(Boolean)),
      text('E7 Meta · build maker', { fontSize: 24, color: C.gold }),
    ]),
  ]);
}
