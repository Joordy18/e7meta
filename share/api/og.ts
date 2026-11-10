import { ImageResponse } from '@vercel/og';
import { SITE, parseCard, resolve } from '../lib/card';
import { loadImages } from '../lib/images';
import { cardLayout } from '../lib/layout';

export const config = { runtime: 'edge' };

/** The PNG card of a build (`/api/og?h=…&s=…&a=…&n=…&l=…`); the same parameters as the preview page. */
export default async function handler(req: Request): Promise<Response> {
  const site = process.env.SITE_URL ?? SITE;
  const resolved = await resolve(parseCard(new URL(req.url).searchParams), async (p) => {
    const res = await fetch(new URL(p, site));
    if (!res.ok) throw new Error(`${p}: ${res.status}`);
    return res.json();
  }).catch(() => null);
  if (!resolved) return new Response('Unknown hero', { status: 404 });
  const card = new ImageResponse(cardLayout(resolved, await loadImages(resolved)) as never, { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } });
  return card;
}
