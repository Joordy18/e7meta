export type BarItem = { label: string; value: number; title?: string };

export const formatValue = (v: number, unit = '%') => `${String(v).replace('.', ',')} ${unit}`;

export default function Bars({ items, unit }: { items: BarItem[]; unit?: string }) {
  if (items.length === 0) return <p>Aucune donnée</p>;
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} role="meter" aria-valuenow={it.value} aria-valuemin={0} aria-valuemax={100} title={it.title}
          style={{ position: 'relative', margin: '2px 0', padding: '2px 6px', display: 'flex', justifyContent: 'space-between' }}>
          <span aria-hidden style={{ position: 'absolute', inset: 0, width: `${Math.min(100, Math.max(0, it.value))}%`, background: '#8ab4f8', opacity: 0.4 }} />
          <span style={{ position: 'relative' }}>{it.label}</span>
          <span style={{ position: 'relative' }}>{formatValue(it.value, unit)}</span>
        </div>
      ))}
    </div>
  );
}
