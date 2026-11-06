import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HeroFace, HeroIcon } from '../src/components/Art';

afterEach(cleanup);

describe('hero images that cannot be loaded', () => {
  it('show the first letters of the name instead of the picture', () => {
    const { container } = render(<><HeroIcon code="c1" name="Setsuka" /><HeroFace code="c1" name="Setsuka" /></>);
    for (const img of container.querySelectorAll('img')) fireEvent.error(img);
    expect([...container.querySelectorAll('.face-initials')].map((e) => e.textContent)).toEqual(['Se', 'Se']);
  });

  it('do not take the page down when the name is missing: the code stands in for it', () => {
    // the game lists a few heroes without a name (old or internal ones); a missing picture must not crash the whole page
    const { container } = render(<><HeroIcon code="c0089" name={undefined as unknown as string} decorative /><HeroFace code="c0089" name={undefined as unknown as string} /></>);
    for (const img of container.querySelectorAll('img')) fireEvent.error(img);
    expect([...container.querySelectorAll('.face-initials')].map((e) => e.textContent)).toEqual(['c0', 'c0']);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
