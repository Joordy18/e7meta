import { useEffect, useState } from 'react';

export type PageNavItem = { id: string; label: string };

/**
 * Table of contents of a page: a button per section that scrolls down to it, the section being read marked.
 * A rail on the left on a wide screen, a row of buttons on a narrow one (see .page-nav in styles.css). Hidden when there is one section or none.
 */
export default function PageNav({ items }: { items: PageNavItem[] }) {
  const [active, setActive] = useState<string>();
  const key = items.map((i) => i.id).join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver((entries) => {
      for (const e of entries) (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
      const first = items.find((i) => visible.has(i.id));
      if (first) setActive(first.id); // nothing in view (between two sections): the last one stays marked
    }, { rootMargin: '-72px 0px -55% 0px' }); // a section counts once it reaches the upper part of the screen, under the bar
    for (const i of items) { const el = document.getElementById(i.id); if (el) observer.observe(el); }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for the ids in `items`
  }, [key]);

  if (items.length < 2) return null;
  return (
    <nav className="page-nav" aria-label="On this page">
      {items.map((i) => (
        <button
          key={i.id} type="button" aria-current={active === i.id ? 'location' : undefined}
          onClick={() => document.getElementById(i.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >{i.label}</button>
      ))}
    </nav>
  );
}
