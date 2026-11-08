import { useI18n } from '../i18n';
import { REPO } from '../pages/AboutPage';

const external = { target: '_blank', rel: 'noreferrer' } as const;

/** Bottom of every page: the pages about the site, the places the data comes from, and the "unofficial" notice. */
export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="foot" aria-label={t('foot.label')}>
      <p>{t('foot.disclaimer')}</p>
      <nav>
        <a href="#/about">{t('foot.about')}</a>
        <a href="#/about/data">{t('foot.data')}</a>
        <a href="#/about/legal">{t('foot.legal')}</a>
        <a href={REPO} {...external}>{t('foot.github')}</a>
        <a href="https://epic7.onstove.com" {...external}>{t('foot.official')}</a>
        <a href="https://page.onstove.com/epicseven/global" {...external}>{t('foot.community')}</a>
        <a href="https://epic7db.com" {...external}>{t('foot.epic7db')}</a>
      </nav>
    </footer>
  );
}
