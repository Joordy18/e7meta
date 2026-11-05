import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Markdown, { parseGuide } from '../src/lib/markdown';

afterEach(cleanup);

describe('parseGuide', () => {
  it('reads the front matter and returns the body', () => {
    const g = parseGuide('---\ntitle: How to read it\nsummary: A short one\ndate: 2026-11-05\n---\n\n# Hello\n\nBody.');
    expect(g.meta).toEqual({ title: 'How to read it', summary: 'A short one', date: '2026-11-05' });
    expect(g.body.trim()).toBe('# Hello\n\nBody.');
  });
  it('allows a colon inside a value', () => {
    expect(parseGuide('---\ntitle: Rift: what it is\nsummary: s\ndate: 2026-01-01\n---\nx').meta.title).toBe('Rift: what it is');
  });
  it('throws on a missing or incomplete front matter, so a broken guide is caught by the tests', () => {
    expect(() => parseGuide('# no front matter')).toThrow(/front matter/);
    expect(() => parseGuide('---\ntitle: only a title\n---\nx')).toThrow(/summary/);
  });
});

describe('Markdown', () => {
  it('renders headings, paragraphs and lists', () => {
    render(<Markdown source={'# Title\n\n## Part\n\nSome text.\n\n- one\n- two\n\n1. first\n2. second'} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Part' })).toBeTruthy();
    expect(screen.getByText('Some text.').tagName).toBe('P');
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['one', 'two', 'first', 'second']);
  });
  it('renders bold, italic, inline code and links inside a paragraph', () => {
    render(<Markdown source={'A **bold** and *soft* word, `code`, and [the modes page](#/modes).'} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('soft').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByRole('link', { name: 'the modes page' }).getAttribute('href')).toBe('#/modes');
  });
  it('opens external links safely and refuses other schemes', () => {
    render(<Markdown source={'[site](https://example.com/x) and [bad](javascript:alert(1)) and [data](data:text/html,x)'} />);
    const ok = screen.getByRole('link', { name: 'site' });
    expect(ok.getAttribute('href')).toBe('https://example.com/x');
    expect(ok.getAttribute('rel')).toBe('noopener noreferrer');
    expect(ok.getAttribute('target')).toBe('_blank');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'data' })).toBeNull();
    expect(screen.getByText(/bad/)).toBeTruthy(); // the text stays, without a link
  });
  it('never injects raw HTML', () => {
    const { container } = render(<Markdown source={'<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });
  it('renders block quotes', () => {
    render(<Markdown source={'> Careful: estimate.'} />);
    expect(screen.getByText('Careful: estimate.').closest('blockquote')).toBeTruthy();
  });
});
