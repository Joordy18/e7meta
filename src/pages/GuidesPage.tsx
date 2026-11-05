import Markdown from '../lib/markdown';
import { findGuide, guides } from '../lib/guides';

export function GuidePage({ slug }: { slug: string }) {
  const guide = findGuide(slug);
  return (
    <article>
      <a className="back" href="#/guides">← All guides</a>
      {guide ? (
        <>
          <h1 className="page-title guide-title">{guide.title}</h1>
          <p className="guide-date">{guide.date}</p>
          <Markdown source={guide.body} />
        </>
      ) : (
        <p className="note">Guide not found</p>
      )}
    </article>
  );
}

export default function GuidesPage() {
  return (
    <div>
      <h1 className="page-title">Guides</h1>
      <p className="lede">Notes on reading the numbers and on the game modes behind them.</p>
      <ul className="guide-list">
        {guides.map((g) => (
          <li key={g.slug} className="panel">
            <a href={`#/guides/${g.slug}`}>{g.title}</a>
            <p>{g.summary}</p>
            <small>{g.date}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
