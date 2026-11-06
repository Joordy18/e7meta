import { LANGS, useI18n, type Lang } from '../i18n';

/** Language choice, each language named in itself. */
export default function LanguageMenu() {
  const { lang, setLang, t } = useI18n();
  return (
    <select className="lang-menu" aria-label={t('lang.label')} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
