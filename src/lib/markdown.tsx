import type { ReactNode } from 'react';

export type GuideMeta = { title: string; summary: string; date: string };

/** Splits `---` front matter (title, summary, date) from the Markdown body. Throws on a broken guide so the tests catch it. */
export function parseGuide(raw: string): { meta: GuideMeta; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('guide has no front matter');
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of ['title', 'summary', 'date'] as const) if (!fields[k]) throw new Error(`front matter is missing ${k}`);
  return { meta: { title: fields.title, summary: fields.summary, date: fields.date }, body: m[2] };
}

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const isExternal = (u: string) => /^https?:\/\//i.test(u);
const isInternal = (u: string) => u.startsWith('#/');

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, url] = link;
      if (isInternal(url)) return <a key={i} href={url}>{label}</a>;
      if (isExternal(url)) return <a key={i} href={url} target="_blank" rel="noopener noreferrer">{label}</a>;
      return label; // any other scheme (javascript:, data:...) is shown as plain text
    }
    return part;
  });
}

/**
 * A deliberately small Markdown subset: headings (#, ##, ###), paragraphs, "-" and "1." lists, "> " quotes,
 * **bold**, *italic*, `code` and links. Everything is built as React nodes, so raw HTML in a guide is shown as text, never run.
 */
export default function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="prose">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        const heading = /^(#{1,3})\s+(.*)$/.exec(block);
        if (heading && lines.length === 1) {
          const Tag = `h${heading[1].length}` as 'h1' | 'h2' | 'h3';
          return <Tag key={i}>{inline(heading[2])}</Tag>;
        }
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^[-*]\s+/, ''))}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\.\s+/.test(l))) {
          return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\.\s+/, ''))}</li>)}</ol>;
        }
        if (lines.every((l) => l.startsWith('>'))) {
          return <blockquote key={i}><p>{inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>;
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}
