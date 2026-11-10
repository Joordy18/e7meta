import { useI18n } from '../i18n';

/** The tools built on the site's data: for now, the draft simulator. */
export default function ToolsPage() {
  const { t } = useI18n();
  return (
    <div>
      <h1 className="page-title">{t('tools.title')}</h1>
      <p className="lede">{t('tools.lede')}</p>
      <ul className="guide-list">
        <li className="panel">
          <a href="#/tools/draft">{t('tools.draftTitle')}</a>
          <p>{t('tools.draftText')}</p>
          <a className="tab" href="#/tools/draft">{t('tools.open')}</a>
        </li>
        <li className="panel">
          <a href="#/tools/team">{t('tools.teamTitle')}</a>
          <p>{t('tools.teamText')}</p>
          <a className="tab" href="#/tools/team">{t('tools.open')}</a>
        </li>
        <li className="panel">
          <a href="#/tools/build">{t('tools.buildTitle')}</a>
          <p>{t('tools.buildText')}</p>
          <a className="tab" href="#/tools/build">{t('tools.open')}</a>
        </li>
      </ul>
    </div>
  );
}
