import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Picker from '../src/components/Picker';

afterEach(cleanup);
const options = [{ value: 'a', label: 'Alpha', alt: 'First' }, { value: 'b', label: 'Beta' }, { value: 'c', label: 'Gamma' }];
const setup = (value = 'b', extra: Partial<Parameters<typeof Picker>[0]> = {}) => {
  const onChange = vi.fn();
  render(<Picker label="Pick" value={value} options={options} onChange={onChange} placeholder="Choose" empty="No match" more="Keep typing" {...extra} />);
  return { onChange, box: screen.getByRole('combobox', { name: 'Pick' }) };
};

describe('Picker', () => {
  it('does not change anything on Enter until an option is highlighted', () => {
    const { onChange, box } = setup();
    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'ArrowDown' }); // the first option, not the second
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Alpha' }).id);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('highlights the first match when typing, finds by the other name, and closes on Escape', () => {
    const { onChange, box } = setup('');
    fireEvent.change(box, { target: { value: 'first' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('a');
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByRole('status').textContent).toBe('No match');
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('opens again on a click after a choice, when the field still has the focus', () => {
    const { box } = setup();
    fireEvent.focus(box);
    fireEvent.click(screen.getByRole('option', { name: 'Gamma' }));
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(box);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('says when the list is cut, and offers "none" first when asked', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ value: `v${i}`, label: `Hero ${i}` }));
    render(<Picker label="Many" value="" options={many} onChange={() => {}} placeholder="Choose" none="Nobody" empty="No match" more="Keep typing" />);
    fireEvent.focus(screen.getByRole('combobox', { name: 'Many' }));
    expect(screen.getAllByRole('option')).toHaveLength(41); // Nobody + the first 40
    expect(screen.getByText('Keep typing')).toBeTruthy();
    expect(screen.getAllByRole('option')[0].textContent).toBe('Nobody');
  });
});
