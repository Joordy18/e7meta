import { Icon } from './Art';

export type BarItem = { label: string; value: number; title?: string; icons?: string[]; href?: string };

export const formatValue = (v: number, unit = '%') => `${v}${unit}`;

export default function Bars({ items, unit }: { items: BarItem[]; unit?: string }) {
  if (items.length === 0) return <p className="empty">No data</p>;
  return (
    <div className="bars">
      {items.map((it, i) => (
        <div key={i} className="bar" role="meter" aria-valuenow={it.value} aria-valuemin={0} aria-valuemax={100} title={it.title}>
          <span className="bar-fill" aria-hidden style={{ width: `${Math.min(100, Math.max(0, it.value))}%` }} />
          {it.icons?.map((src, j) => <Icon key={j} src={src} />)}
          <span className="bar-label">{it.href ? <a href={it.href}>{it.label}</a> : it.label}</span>
          <span className="bar-value">{formatValue(it.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}
