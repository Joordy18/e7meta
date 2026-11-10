// Draws a card to a PNG on this machine, from the site's data files in ../public (no deployment needed): npx tsx share/render-local.mts "<query>" out.png
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseCard, resolve } from './lib/card';
import { loadImages } from './lib/images';
import { cardLayout } from './lib/layout';

// the Node build of @vercel/og calls require() inside an ES module
Object.assign(globalThis, { require: createRequire(import.meta.url), __dirname: fileURLToPath(new URL('./node_modules/@vercel/og/dist', import.meta.url)), __filename: '' });
const { ImageResponse } = await import('@vercel/og');
const [query = 'h=c1137&s=set_speed,set_max_hp,set_max_hp&a=efk03&n=Speed 190+, crit 100%', out = 'card.png'] = process.argv.slice(2);
const resolved = await resolve(parseCard(new URLSearchParams(query)), async (p) => JSON.parse(await readFile(new URL(`../public/${p}`, import.meta.url), 'utf8')));
if (!resolved) throw new Error('unknown hero');
const res = new ImageResponse(cardLayout(resolved, await loadImages(resolved)) as never, { width: 1200, height: 630 });
await writeFile(out, Buffer.from(await res.arrayBuffer()));
console.log('wrote', out);
