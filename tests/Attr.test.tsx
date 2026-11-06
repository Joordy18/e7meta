import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ElementIcon, JobIcon } from '../src/components/Art';

afterEach(cleanup);

describe('ElementIcon / JobIcon', () => {
  it('names the element and the class in English for screen readers and as a tooltip', () => {
    render(<><ElementIcon element="wind" /><JobIcon job="assassin" /><JobIcon job="manauser" /></>);
    expect(screen.getByRole('img', { name: 'Earth' }).getAttribute('title')).toBe('Earth'); // the game's "wind" is Earth
    expect(screen.getByRole('img', { name: 'Thief' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Soul Weaver' })).toBeTruthy();
  });
  it('picks the icon of the sheet by element and by class', () => {
    render(<><ElementIcon element="ice" /><JobIcon job="knight" /></>);
    expect(screen.getByRole('img', { name: 'Ice' }).getAttribute('data-attr')).toBe('el-ice');
    expect(screen.getByRole('img', { name: 'Knight' }).getAttribute('data-attr')).toBe('job-knight');
  });
  it('shows the plain name for a value without an icon', () => {
    render(<><ElementIcon element="void" /><JobIcon job="NN" /></>);
    expect(screen.getByText('void')).toBeTruthy();
    expect(screen.getByText('NN')).toBeTruthy();
  });
});
