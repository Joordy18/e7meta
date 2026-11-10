import { useId, useMemo, useState, type ReactNode } from 'react';
import { normalize } from '../lib/data';

export type PickOption = { value: string; label: string; alt?: string; icon?: ReactNode }; // alt: the English name, when label is a translation
const SHOWN = 40; // a list of hundreds of heroes shows its first matches: typing narrows it

/**
 * A box you can type in to find one choice (a hero, an artifact) among many, each with its icon. Case and accents are ignored; the English name matches too.
 * `none` adds a first choice that clears the value (value ""). No hover is needed: a click, a tap or the keyboard (arrows, Enter, Escape) all work.
 */
export default function Picker({ label, value, options, onChange, placeholder, none, disabled, empty }: {
  label: string; value: string; options: PickOption[]; onChange: (value: string) => void; placeholder: string; none?: string; disabled?: boolean; empty: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const current = options.find((o) => o.value === value);

  const list = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const found = options.filter((o) => words.every((w) => normalize(o.label).includes(w) || (o.alt !== undefined && normalize(o.alt).includes(w))));
    const rest = found.slice(0, SHOWN);
    return none !== undefined && words.length === 0 ? [{ value: '', label: none } as PickOption, ...rest] : rest;
  }, [options, query, none]);

  const close = () => { setOpen(false); setQuery(''); setActive(0); };
  const choose = (o: PickOption) => { onChange(o.value); close(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); choose(list[active]); }
  };

  return (
    <div className="picker">
      {current && !open && <span className="picker-icon">{current.icon}</span>}
      <input
        role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" autoComplete="off" disabled={disabled}
        className={current && !open ? 'has-icon' : undefined}
        placeholder={placeholder} value={open ? query : current?.label ?? ''}
        onFocus={() => setOpen(true)} onBlur={close}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }} onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={id} role="listbox" aria-label={label}>
          {list.length === 0 && <li className="picker-none">{empty}</li>}
          {list.map((o, i) => (
            // mousedown keeps the focus in the box so the choice is not lost to the blur that would close the list first
            <li key={o.value || 'none'} role="option" aria-selected={o.value === value} className={i === active ? 'active' : undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)}>
              {o.icon}<span>{o.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
