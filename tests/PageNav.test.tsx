import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PageNav from '../src/components/PageNav';

type Entry = { target: Element; isIntersecting: boolean };
let callback: ((entries: Entry[]) => void) | undefined;
let observed: string[];
let scrolled: string[];

beforeEach(() => {
  callback = undefined;
  observed = [];
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); }; // jsdom has none
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    constructor(cb: (entries: Entry[]) => void) { callback = cb; }
    observe(el: Element) { observed.push(el.id); }
    disconnect() {}
  };
});
afterEach(cleanup);

const items = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta' }, { id: 'c', label: 'Gamma' }];
const page = () => render(<><PageNav items={items} /><section id="a" /><section id="b" /><section id="c" /></>);
const see = (...ids: string[]) => act(() => callback!(ids.map((id) => ({ target: document.getElementById(id)!, isIntersecting: true }))));

describe('PageNav', () => {
  it('lists the sections of the page as buttons that scroll down to them', () => {
    page();
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Gamma' }));
    expect(scrolled).toEqual(['c']);
  });

  it('is not shown for a page with a single section', () => {
    render(<PageNav items={[{ id: 'a', label: 'Alpha' }]} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('watches every section and marks the first one in the page that is in view', () => {
    page();
    expect(observed).toEqual(['a', 'b', 'c']);
    see('b');
    expect(screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-current')).toBe('location');
    expect(screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-current')).toBeNull();
    see('c');
    // b and c are both in view now: the one that comes first in the page wins
    expect(screen.getByRole('button', { name: 'Beta' }).getAttribute('aria-current')).toBe('location');
    act(() => callback!([{ target: document.getElementById('b')!, isIntersecting: false }]));
    expect(screen.getByRole('button', { name: 'Gamma' }).getAttribute('aria-current')).toBe('location');
  });

  it('keeps the last marked section when none is in view, and works without IntersectionObserver', () => {
    page();
    see('a');
    act(() => callback!([{ target: document.getElementById('a')!, isIntersecting: false }]));
    expect(screen.getByRole('button', { name: 'Alpha' }).getAttribute('aria-current')).toBe('location');
    cleanup();
    delete (globalThis as unknown as { IntersectionObserver?: unknown }).IntersectionObserver;
    page();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});
