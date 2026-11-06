import { Fragment, createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadNames } from '../lib/data';
import type { NamesFile } from '../shared/types';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { ja } from './ja';
import { ko } from './ko';
import { zh } from './zh';

export type Lang = 'en' | 'fr' | 'de' | 'ja' | 'ko' | 'zh';
export type Key = keyof typeof en;
type Values = Record<string, string | number>;

/** The languages the site offers, each named in itself. A language is added here, in the dictionaries below and in LOCALE. */
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' }, { code: 'fr', label: 'Français' }, { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' }, { code: 'ko', label: '한국어' }, { code: 'zh', label: '繁體中文' }, // zh: traditional Chinese, what the game's guide serves
];
const DICT: Record<Lang, Record<Key, string>> = { en, fr, de, ja, ko, zh };
const LOCALE: Record<Lang, string> = { en: 'en-US', fr: 'fr-FR', de: 'de-DE', ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-TW' };
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

/** Names of heroes, artifacts and sets in the current language, by code; the data's own (English) name when there is none. */
export type NameLookup = {
  hero: (code: string, fallback: string) => string;
  artifact: (code: string, fallback: string) => string;
  set: (code: string, fallback: string) => string;
  /** The names of the sets of a combination: `codes[i]` names `fallbacks[i]`; a missing or unknown code keeps the data name. */
  sets: (codes: string[] | undefined, fallbacks: string[]) => string[];
};
const keep = (_code: string, fallback: string) => fallback;
const NO_NAMES: NameLookup = { hero: keep, artifact: keep, set: keep, sets: (_codes, fallbacks) => fallbacks };
const lookup = (n: NamesFile): NameLookup => ({
  hero: (code, fallback) => n.heroes[code] ?? fallback,
  artifact: (code, fallback) => n.artifacts[code] ?? fallback,
  set: (code, fallback) => n.sets[code] ?? fallback,
  sets: (codes, fallbacks) => fallbacks.map((fb, i) => (codes?.[i] ? n.sets[codes[i]] ?? fb : fb)),
});

export type I18n = {
  lang: Lang;
  name: NameLookup;
  setLang: (l: Lang) => void;
  locale: string; // for numbers and dates
  t: (key: Key, values?: Values) => string;
  /** Like t, with elements as values: rich('x', { link: <a>..</a> }) puts the link where {link} is in the translation. */
  rich: (key: Key, values: Record<string, ReactNode>) => ReactNode;
};

function make(lang: Lang, setLang: (l: Lang) => void, name: NameLookup = NO_NAMES): I18n {
  const text = (key: Key) => DICT[lang][key] ?? DICT.en[key] ?? (key as string); // a missing key shows itself
  return {
    lang, setLang, name, locale: LOCALE[lang],
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
  const [names, setNames] = useState<NamesFile | null>(null);
  useEffect(() => { // the names of heroes, artifacts and sets in that language: a bonus, English (the data) stays without them
    setNames(null);
    if (lang === 'en') return;
    let live = true;
    Promise.resolve(loadNames(lang)).then((n) => live && setNames(n)).catch(() => {});
    return () => { live = false; };
  }, [lang]);
  const value = useMemo(() => make(lang, setLang, names ? lookup(names) : NO_NAMES), [lang, names]);
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
