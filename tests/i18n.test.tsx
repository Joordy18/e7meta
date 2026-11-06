import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nProvider, LANGS, detectLang, interpolate, useI18n } from '../src/i18n';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import LanguageMenu from '../src/components/LanguageMenu';
import App from '../src/App';

const setNavigatorLanguage = (l: string) => Object.defineProperty(navigator, 'language', { value: l, configurable: true });

beforeEach(() => { localStorage.clear(); setNavigatorLanguage('en-US'); document.documentElement.lang = ''; location.hash = ''; });
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
    expect(detectLang()).toBe('en'); // no German yet
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

describe('the dictionaries', () => {
  const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it('have the same keys in every language, so nothing is left untranslated', () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
  it('have no empty text, and the same {values} in each language', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(en[k].trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(fr[k].trim().length, `fr ${k}`).toBeGreaterThan(0);
      expect(placeholders(fr[k]), `placeholders of ${k}`).toEqual(placeholders(en[k]));
    }
  });
  it('are listed as languages the menu can offer', () => {
    expect(LANGS.map((l) => l.code)).toEqual(['en', 'fr']);
  });
});

describe('LanguageMenu', () => {
  it('offers the languages by their own name and switches the whole site', () => {
    location.hash = '#/';
    render(<App />);
    const menu = screen.getByRole('combobox', { name: 'Language' });
    expect(within(menu).getAllByRole('option').map((o) => o.textContent)).toEqual(['English', 'Français']);
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Home' })).toBeTruthy();
    fireEvent.change(menu, { target: { value: 'fr' } });
    const nav = within(screen.getByRole('navigation', { name: fr['nav.main'] }));
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual([fr['nav.home'], fr['nav.heroes'], fr['nav.modes'], fr['nav.rta'], fr['nav.guides']]);
    expect(screen.getByRole('combobox', { name: fr['lang.label'] })).toHaveProperty('value', 'fr');
  });
  it('starts on the saved language', () => {
    localStorage.setItem('e7.lang', 'fr');
    render(<I18nProvider><LanguageMenu /></I18nProvider>);
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'fr');
  });
});
