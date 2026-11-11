import type { Resolved } from './card';
import type { Images, Pic } from './layout';

// The game's public guide CDN, the same pictures the site shows.
const BASE = 'https://static-pubcomm.onstove.com/event/live/epic7/guide';
export const sheetUrl = 'https://static-pubcomm.onstove.com/live/epic7/brand/images/guide/icon_spr.png'; // the element and class icons
export const portraitUrl = (code: string) => `${BASE}/images/hero/portrait/${code}.png`;
export const setIconUrl = (code: string) => `${BASE}/wearingStatus/images/sets/${code}.png`;
export const artifactIconUrl = (code: string) => `${BASE}/wearingStatus/images/artifact/${code}_ico.png`;

/** A picture as a data: URI (the card drawer reads it without a second request); null when it cannot be fetched, so the card is drawn without it. */
async function dataUri(url: string): Promise<Pic | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const view = new DataView(bytes.buffer);
    return { src: `data:image/png;base64,${btoa(bin)}`, w: view.getUint32(16), h: view.getUint32(20) }; // a PNG states its size at bytes 16 to 24
  } catch { return null; }
}

export async function loadImages(r: Resolved): Promise<Images> {
  const [sheet, portrait, artifact, ...sets] = await Promise.all([dataUri(sheetUrl), dataUri(portraitUrl(r.code)), r.artifact ? dataUri(artifactIconUrl(r.artifact.code)) : null, ...r.sets.map(([c]) => dataUri(setIconUrl(c)))]);
  return { sheet, portrait, artifact, sets: Object.fromEntries(r.sets.map(([c], i) => [c, sets[i]])) };
}
