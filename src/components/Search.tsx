import { useEffect, useMemo, useRef, useState } from 'react';
import { loadGear, loadHeroes, loadIndex, loadModes } from '../lib/data';
import { artifactIcon } from '../lib/images';
import { useI18n, type Key } from '../i18n';
import { buildSearchItems, searchItems, type PageLink, type SearchItem } from '../lib/search';
import { HeroIcon, Icon } from './Art';

const LIMIT = 10;

/** Quick jump to a hero, artifact, mode, guide or page: Ctrl+K (Cmd+K), or the button in the header. */
export default function Search() {
  const { t, name } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [data, setData] = useState<Parameters<typeof buildSearchItems>[0]>({});
  const loaded = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // the data is fetched the first time the box opens; every part is a bonus (pages and guides are always there)
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    (async () => {
      const latest = (await loadIndex())?.periods[0];
      if (!latest) return;
      const soft = <T,>(p: Promise<T>) => Promise.resolve(p).catch(() => null);
      const [heroes, gear, modes] = await Promise.all([soft(loadHeroes(latest)), soft(loadGear(latest)), soft(loadModes(latest))]);
      setData({ heroes: heroes ?? [], gear, modes });
    })().catch(() => {});
  }, [open]);

  useEffect(() => { if (open) input.current?.focus(); else { setQuery(''); setActive(0); } }, [open]);

  const pages = useMemo<PageLink[]>(() => [[t('nav.home'), '#/'], [t('nav.heroes'), '#/heroes'], [t('nav.modes'), '#/modes'], [t('nav.tiers'), '#/tiers'], [t('nav.rta'), '#/arena'], [t('nav.tools'), '#/tools'], [t('tools.draftTitle'), '#/tools/draft'], [t('tools.teamTitle'), '#/tools/team'], [t('nav.guides'), '#/guides'], [t('foot.about'), '#/about']], [t]);
  const items = useMemo(() => buildSearchItems(data, name, pages), [data, name, pages]);
  const results = useMemo(() => searchItems(items, query, LIMIT), [items, query]);

  const go = (item: SearchItem) => { location.hash = item.href; setOpen(false); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
  };

  return (
    <>
      <button type="button" className="search-btn" aria-label={t('search.button')} onClick={() => setOpen(true)}>
        {t('search.buttonText')} <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div className="search-backdrop" data-testid="search-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="search-box" role="dialog" aria-modal="true" aria-label={t('search.dialog')}>
            <input
              ref={input} role="combobox" aria-expanded aria-controls="search-results" aria-label={t('search.input')}
              placeholder={t('search.placeholder')} value={query} autoComplete="off"
              onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
            />
            {query.trim() === '' && <p className="note">{t('search.hint')}</p>}
            {query.trim() !== '' && results.length === 0 && <p className="note">{t('search.none')}</p>}
            {results.length > 0 && (
              <ul id="search-results" role="listbox" aria-label={t('search.results')}>
                {results.map((r, i) => (
                  <li key={`${r.kind}-${r.href}`} role="option" aria-selected={i === active} className={i === active ? 'active' : undefined} onMouseMove={() => setActive(i)}>
                    {r.kind === 'hero' && r.code && <HeroIcon code={r.code} name={r.label} decorative />}
                    {r.kind === 'artifact' && r.code && <Icon src={artifactIcon(r.code)} className="hicon art" />}
                    <a href={r.href} onClick={() => setOpen(false)}>{r.label}</a>
                    <small className="kind">{t(`search.kind.${r.kind}` as Key)}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
