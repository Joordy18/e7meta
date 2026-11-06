import { Fragment, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export type Key = keyof typeof en;
type Values = Record<string, string | number>;

/** The languages the site offers, each named in itself. A language is added here, in the dictionaries below and in LOCALE. */
export const LANGS: { code: Lang; label: string }[] = [{ code: 'en', label: 'English' }, { code: 'fr', label: 'Français' }];
const DICT: Record<Lang, Record<Key, string>> = { en, fr };
const LOCALE: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR' };
const STORAGE = 'e7.lang';

/** "Show all {n} heroes" with { n: 12 }; a {name} without a value stays visible. */
export function interpolate(template: string, values: Values = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole));
}

/** The saved choice, else the browser's language when the site has it, else English. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang;
  } catch { /* storage blocked: fall through */ }
  const browser = typeof navigator === 'undefined' ? '' : (navigator.language ?? '').slice(0, 2).toLowerCase();
  return LANGS.find((l) => l.code === browser)?.code ?? 'en';
}

export type I18n = {
  lang: Lang;
  setLang: (l: Lang) => void;
  locale: string; // for numbers and dates
  t: (key: Key, values?: Values) => string;
  /** Like t, with elements as values: rich('x', { link: <a>..</a> }) puts the link where {link} is in the translation. */
  rich: (key: Key, values: Record<string, ReactNode>) => ReactNode;
};

function make(lang: Lang, setLang: (l: Lang) => void): I18n {
  const text = (key: Key) => DICT[lang][key] ?? DICT.en[key] ?? (key as string); // a missing key shows itself
  return {
    lang, setLang, locale: LOCALE[lang],
    t: (key, values) => interpolate(text(key), values),
    rich: (key, values) => (
      <>
        {text(key).split(/\{(\w+)\}/g).map((part, i) => (
          <Fragment key={i}>{i % 2 === 1 ? (part in values ? values[part] : `{${part}}`) : part}</Fragment>
        ))}
      </>
    ),
  };
}

const Context = createContext<I18n>(make('en', () => {})); // without a provider (tests, isolated components): English

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectLang);
  useEffect(() => {
    try { localStorage.setItem(STORAGE, lang); } catch { /* storage blocked: the choice lasts for this visit */ }
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => make(lang, setLang), [lang]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useI18n = () => useContext(Context);

/** The name of a class or an element in the current language; the game's code itself when it has no translation. */
export function useLabels() {
  const { t } = useI18n();
  return {
    job: (code: string) => (`job.${code}` in en ? t(`job.${code}` as Key) : code),
    element: (code: string) => (`element.${code}` in en ? t(`element.${code}` as Key) : code),
  };
}
