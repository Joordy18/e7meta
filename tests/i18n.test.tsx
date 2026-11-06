import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider, LANGS, detectLang, interpolate, useI18n } from '../src/i18n';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { de } from '../src/i18n/de';
import { ja } from '../src/i18n/ja';
import { ko } from '../src/i18n/ko';
import { zh } from '../src/i18n/zh';
import LanguageMenu from '../src/components/LanguageMenu';
import App from '../src/App';
import { loadNames } from '../src/lib/data';

vi.mock('../src/lib/data', async (orig) => ({ ...(await orig<typeof import('../src/lib/data')>()), loadNames: vi.fn() }));

const setNavigatorLanguage = (l: string) => Object.defineProperty(navigator, 'language', { value: l, configurable: true });

beforeEach(() => { vi.mocked(loadNames).mockResolvedValue(null); localStorage.clear(); setNavigatorLanguage('en-US'); document.documentElement.lang = ''; location.hash = ''; });
afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider>{children}</I18nProvider>;

describe('interpolate', () => {
  it('puts the values where the {names} are, and leaves unknown names visible', () => {
    expect(interpolate('Show all {n} heroes', { n: 12 })).toBe('Show all 12 heroes');
    expect(interpolate('{a} and {b}, {a}', { a: 'x', b: 'y' })).toBe('x and y, x');
    expect(interpolate('Hello {who}', {})).toBe('Hello {who}');
  });
});

describe('detectLang', () => {
  it('takes the saved choice first, then the browser language when we have it, else English', () => {
    expect(detectLang()).toBe('en');
    setNavigatorLanguage('fr-CA');
    expect(detectLang()).toBe('fr');
    setNavigatorLanguage('de-DE');
    expect(detectLang()).toBe('de');
    setNavigatorLanguage('ja-JP');
    expect(detectLang()).toBe('ja');
    setNavigatorLanguage('ko');
    expect(detectLang()).toBe('ko');
    setNavigatorLanguage('zh-TW');
    expect(detectLang()).toBe('zh');
    setNavigatorLanguage('it-IT');
    expect(detectLang()).toBe('en'); // a language the site does not have
    localStorage.setItem('e7.lang', 'fr');
    expect(detectLang()).toBe('fr');
    localStorage.setItem('e7.lang', 'xx'); // an unknown saved value is ignored
    expect(detectLang()).toBe('en');
  });
});

describe('useI18n', () => {
  it('translates a key into the current language, with values, and falls back to English for a missing one', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.lang).toBe('en');
    expect(result.current.t('nav.home')).toBe(en['nav.home']);
    act(() => result.current.setLang('fr'));
    expect(result.current.t('nav.home')).toBe(fr['nav.home']);
    expect(result.current.t('nav.home')).not.toBe(en['nav.home']);
    expect(result.current.t('does.not.exist' as never)).toBe('does.not.exist');
  });

  it('remembers the choice, and sets the language of the page', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang('fr'));
    expect(localStorage.getItem('e7.lang')).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(result.current.locale).toBe('fr-FR');
    for (const [lang, locale] of [['de', 'de-DE'], ['ja', 'ja-JP'], ['ko', 'ko-KR'], ['zh', 'zh-TW']] as const) {
      act(() => result.current.setLang(lang));
      expect(result.current.locale).toBe(locale);
      expect(document.documentElement.lang).toBe(lang);
    }
  });

  it('puts elements inside a sentence with rich(), in the order of the translation', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    const { container } = render(<p>{result.current.rich('home.fullPreview', { link: <a href="#x">the link</a> })}</p>);
    expect(container.querySelector('a')?.textContent).toBe('the link');
    expect(container.textContent).not.toContain('{link}');
  });

  it('works without a provider, in English', () => {
    const { result } = renderHook(() => useI18n());
    expect(result.current.t('nav.home')).toBe(en['nav.home']);
  });
});

describe('names of heroes, artifacts and sets', () => {
  const file = { lang: 'fr', updated: 'x', heroes: { c1: 'Abigaëlle' }, artifacts: { efk21: 'Couronne' }, sets: { set_speed: 'Set Vitesse' } };

  it('are the data names in English, and nothing is loaded', () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    expect(result.current.name.hero('c1', 'Abigail')).toBe('Abigail');
    expect(result.current.name.artifact('efk21', '3F')).toBe('3F');
    expect(result.current.name.set('set_speed', 'Speed Set')).toBe('Speed Set');
    expect(loadNames).not.toHaveBeenCalled();
  });

  it('come from the names file of the language, by code, with the data name for a code it does not know', async () => {
    vi.mocked(loadNames).mockResolvedValue(file);
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang('fr'));
    await waitFor(() => expect(result.current.name.hero('c1', 'Abigail')).toBe('Abigaëlle'));
    expect(loadNames).toHaveBeenCalledWith('fr');
    expect(result.current.name.artifact('efk21', '3F')).toBe('Couronne');
    expect(result.current.name.set('set_speed', 'Speed Set')).toBe('Set Vitesse');
    expect(result.current.name.hero('c999', 'New Hero')).toBe('New Hero');
    expect(result.current.name.sets(['set_speed', 'set_x'], ['Speed Set', 'Other Set'])).toEqual(['Set Vitesse', 'Other Set']);
    expect(result.current.name.sets(undefined, ['Speed Set'])).toEqual(['Speed Set']); // a snapshot from before set codes were kept
    act(() => result.current.setLang('en'));
    expect(result.current.name.hero('c1', 'Abigail')).toBe('Abigail');
  });

  it('stay the data names when the file is missing or cannot be read', async () => {
    const { result } = renderHook(() => useI18n(), { wrapper });
    act(() => result.current.setLang('fr'));
    await waitFor(() => expect(loadNames).toHaveBeenCalled());
    expect(result.current.name.hero('c1', 'Abigail')).toBe('Abigail');
    vi.mocked(loadNames).mockRejectedValue(new Error('down'));
    act(() => result.current.setLang('en'));
    act(() => result.current.setLang('fr'));
    await waitFor(() => expect(loadNames).toHaveBeenCalledTimes(2));
    expect(result.current.name.hero('c1', 'Abigail')).toBe('Abigail');
  });
});

describe('the dictionaries', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  const others = { fr, de, ja, ko, zh };
  it('have the same keys in every language, so nothing is left untranslated', () => {
    for (const [code, dict] of Object.entries(others)) expect(Object.keys(dict).sort(), code).toEqual(Object.keys(en).sort());
  });
  it('have no empty text, and the same {values} in each language', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[k].trim().length, `en ${k}`).toBeGreaterThan(0);
      for (const [code, dict] of Object.entries(others)) {
        expect(dict[k].trim().length, `${code} ${k}`).toBeGreaterThan(0);
        expect(placeholders(dict[k]), `${code} placeholders of ${k}`).toEqual(placeholders(en[k]));
      }
    }
  });
  it('are really translated: most texts differ from the English ones', () => {
    const keys = Object.keys(en) as (keyof typeof en)[];
    for (const [code, dict] of Object.entries(others)) {
      const differing = keys.filter((k) => dict[k] !== en[k]).length;
      expect(differing / keys.length, code).toBeGreaterThan(0.7);
    }
  });
  it('are listed as languages the menu can offer', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['en', 'fr', 'de', 'ja', 'ko', 'zh']);
  });
});

describe('LanguageMenu', () => {
  it('offers the languages by their own name and switches the whole site', () => {
    location.hash = '#/';
    render(<App />);
    const menu = screen.getByRole('combobox', { name: 'Language' });
    expect(within(menu).getAllByRole('option').map((o) => o.textContent)).toEqual(['English', 'Français', 'Deutsch', '日本語', '한국어', '繁體中文']);
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' })).toBeTruthy();
    fireEvent.change(menu, { target: { value: 'fr' } });
    const nav = within(screen.getByRole('navigation', { name: fr['nav.main'] }));
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual([fr['nav.home'], fr['nav.heroes'], fr['nav.modes'], fr['nav.tiers'], fr['nav.rta'], fr['nav.tools'], fr['nav.guides']]);
    expect(screen.getByRole('combobox', { name: fr['lang.label'] })).toHaveProperty('value', 'fr');
  });
  it('switches the site to each other language', () => {
    location.hash = '#/';
    render(<App />);
    for (const [code, dict] of [['de', de], ['ja', ja], ['ko', ko], ['zh', zh]] as const) {
      fireEvent.change(screen.getByRole('combobox', { name: /./ }), { target: { value: code } });
      const nav = within(screen.getByRole('navigation', { name: dict['nav.main'] }));
      expect(nav.getAllByRole('link').map((a) => a.textContent), code).toEqual([dict['nav.home'], dict['nav.heroes'], dict['nav.modes'], dict['nav.tiers'], dict['nav.rta'], dict['nav.tools'], dict['nav.guides']]);
      expect(document.documentElement.lang).toBe(code);
    }
  });
  it('starts on the saved language', () => {
    localStorage.setItem('e7.lang', 'fr');
    render(<I18nProvider><LanguageMenu /></I18nProvider>);
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'fr');
  });
});
