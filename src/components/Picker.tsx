import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { normalize } from '../lib/data';

export type PickOption = { value: string; label: string; alt?: string; icon?: ReactNode }; // alt: the English name, when label is a translation
const SHOWN = 40; // a list of hundreds of heroes shows its first matches: typing narrows it

/**
 * A box you can type in to find one choice (a hero, an artifact) among many, each with its icon. Case and accents are ignored; the English name matches too.
 * `none` adds a first choice that clears the value (value ""). No hover is needed: a click, a tap or the keyboard (arrows, Enter, Escape) all work.
 * Nothing is chosen by Enter until an option is highlighted (by typing, which highlights the first match, or by the arrows).
 */
export default function Picker({ label, value, options, onChange, placeholder, none, disabled, empty, more }: {
  label: string; value: string; options: PickOption[]; onChange: (value: string) => void; placeholder: string; none?: string; disabled?: boolean; empty: string; more: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const current = options.find((o) => o.value === value);

  const { list, cut } = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const found = options.filter((o) => words.every((w) => normalize(o.label).includes(w) || (o.alt !== undefined && normalize(o.alt).includes(w))));
    const shown = found.slice(0, SHOWN);
    return { list: none !== undefined && words.length === 0 ? [{ value: '', label: none } as PickOption, ...shown] : shown, cut: found.length > SHOWN };
  }, [options, query, none]);

  const optionId = (i: number) => `${id}-${i}`;
  useEffect(() => { if (open && active >= 0) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setOpen(false); setQuery(''); setActive(-1); };
  const choose = (o: PickOption) => { onChange(o.value); close(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) { setOpen(true); setActive(0); } else setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); choose(list[active]); }
  };

  return (
    <div className="picker">
      {current && !open && <span className="picker-icon">{current.icon}</span>}
      <input
        role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        aria-activedescendant={open && active >= 0 && list[active] ? optionId(active) : undefined}
        className={current && !open ? 'has-icon' : undefined}
        placeholder={placeholder} value={open ? query : current?.label ?? ''}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onBlur={close} // a click on a field that already has the focus (after a choice, or Escape) opens it again
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }} onKeyDown={onKeyDown}
      />
      {open && list.length === 0 && <div className="picker-none" role="status">{empty}</div>}
      {open && list.length > 0 && (
        // mousedown keeps the focus in the box, so the choice is not lost to the blur that would close the list first (also when the list's scrollbar is grabbed)
        <ul id={id} role="listbox" aria-label={label} onMouseDown={(e) => e.preventDefault()}>
          {list.map((o, i) => (
            <li key={o.value || 'none'} id={optionId(i)} role="option" aria-selected={o.value === value} className={i === active ? 'active' : undefined} onClick={() => choose(o)}>
              {o.icon}<span>{o.label}</span>
            </li>
          ))}
          {cut && <li role="presentation" className="picker-more">{more}</li>}
        </ul>
      )}
    </div>
  );
}
