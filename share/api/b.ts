import { SITE, parseCard, previewPage, resolve, setsText, siteLink } from '../lib/card';

export const config = { runtime: 'edge' };

/** A shared build link (`/b?h=…&s=…&a=…&n=…&l=…`): the page whose tags give chat apps the preview, then on to the site. */
export default async function handler(req: Request): Promise<Response> {
  const site = process.env.SITE_URL ?? SITE;
  const url = new URL(req.url);
  const card = parseCard(url.searchParams);
  const target = siteLink(site, card);
  const resolved = await resolve(card, async (p) => {
    const res = await fetch(new URL(p, site));
    if (!res.ok) throw new Error(`${p}: ${res.status}`);
    return res.json();
  }).catch(() => null);
  const title = resolved ? `${resolved.name} build` : 'E7 Meta build maker';
  const description = resolved ? [setsText(resolved), resolved.artifact?.name, resolved.note].filter(Boolean).join(' · ') : 'Put together a build for a hero and share it with a link.';
  const image = resolved ? `${url.origin}/api/og${url.search}` : '';
  return new Response(previewPage({ title, description, image, target, url: url.href }), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' } });
}
