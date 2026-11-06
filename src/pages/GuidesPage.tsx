import { useI18n } from '../i18n';
import Markdown from '../lib/markdown';
import { findGuide, guides } from '../lib/guides';

export function GuidePage({ slug }: { slug: string }) {
  const { t } = useI18n();
  const guide = findGuide(slug);
  return (
    <article>
      <a className="back" href="#/guides">{t('guides.back')}</a>
      {guide ? (
        <>
          <h1 className="page-title guide-title">{guide.title}</h1>
          <p className="guide-date">{guide.date}</p>
          <Markdown source={guide.body} />
        </>
      ) : (
        <p className="note">{t('guides.notFound')}</p>
      )}
    </article>
  );
}

export default function GuidesPage() {
  const { t } = useI18n();
  return (
    <div>
      <h1 className="page-title">{t('guides.title')}</h1>
      <p className="lede">{t('guides.lede')}</p>
      {guides.length === 0 && <p className="note">{t('guides.none')}</p>}
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
