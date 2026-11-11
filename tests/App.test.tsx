import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../src/App';

vi.mock('../src/lib/data', async (orig) => ({
  ...(await orig<typeof import('../src/lib/data')>()),
  loadIndex: vi.fn(async () => ({ periods: ['2026-10-29'] })),
  loadHeroes: vi.fn(async () => [{ code: 'c1', name: 'Mage One', grade: 5, job: 'mage', element: 'fire' }]),
  loadGear: vi.fn(async () => ({ key: 'k', artifacts: {} })),
  loadRtaBuilds: vi.fn(async () => null),
  loadFeed: vi.fn(async () => null), loadLimited: vi.fn(async () => null), loadRta: vi.fn(async () => null),
}));

afterEach(() => { cleanup(); history.replaceState(null, '', '#/'); });

describe('App', () => {
  it('starts the build maker over when we come back to the address it was opened with, although its state lives in the address without an event', async () => {
    history.replaceState(null, '', '#/tools/build');
    render(<App />);
    fireEvent.change(await screen.findByRole('textbox', { name: /^Note/ }), { target: { value: 'hello' } });
    await waitFor(() => expect(location.hash).toBe('#/tools/build?n=hello'));
    history.replaceState(null, '', '#/tools/build'); // as a link to the bare page does
    act(() => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
    expect(((await screen.findByRole('textbox', { name: /^Note/ })) as HTMLTextAreaElement).value).toBe('');
  });
});
