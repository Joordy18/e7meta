import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import AboutPage, { REPO } from '../src/pages/AboutPage';
import App from '../src/App';
import Footer from '../src/components/Footer';
import { en } from '../src/i18n/en';

let scrolled: string[];
beforeEach(() => {
  scrolled = [];
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); }; // jsdom has none
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} };
});
afterEach(() => { cleanup(); vi.useRealTimers(); location.hash = ''; });

describe('AboutPage', () => {
  it('has the four parts, every question with its answer, and every source of the data', () => {
    render(<AboutPage />);
    for (const id of ['faq', 'data', 'status', 'limits', 'legal']) expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getAllByRole('group').length).toBeGreaterThanOrEqual(9); // one <details> per question
    expect(screen.getByText(en['about.q1'])).toBeTruthy();
    expect(screen.getByText(en['about.src3Title'])).toBeTruthy(); // RTA battles
    expect(screen.getByText(en['about.g1Title'])).toBeTruthy(); // no cookies
  });

  it('points the feedback question and the removal request to the issues of the repository', () => {
    render(<AboutPage />);
    const links = screen.getAllByRole('link', { name: 'GitHub' });
    expect(links).toHaveLength(2);
    for (const a of links) expect(a.getAttribute('href')).toBe(`${REPO}/issues`);
  });

  it('scrolls to the part named by the route', () => {
    render(<AboutPage section="legal" />);
    act(() => { vi.runAllTimers(); });
    expect(scrolled).toEqual(['legal']);
  });
});

describe('Footer', () => {
  it('says the site is unofficial and links the about pages and the official sources', () => {
    render(<Footer />);
    const foot = screen.getByRole('contentinfo');
    expect(within(foot).getByText(en['foot.disclaimer'])).toBeTruthy();
    const hrefs = within(foot).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['#/about', '#/about/data', '#/about/legal', REPO, 'https://epic7.onstove.com', 'https://epic7db.com']));
  });
});

describe('App', () => {
  it('shows the footer on a page and the About page on its route, without marking a menu entry', async () => {
    location.hash = '#/about/faq';
    vi.useRealTimers();
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: en['about.title'] })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(document.querySelector('header nav [aria-current="page"]')).toBeNull();
  });
});
