// Official art, hotlinked from the game's public guide CDN (not stored in this repo).
const BASE = 'https://static-pubcomm.onstove.com/event/live/epic7/guide';

/** Small square hero icon (about 8 KB; the portrait is about 250 KB). */
export const heroIcon = (code: string) => `${BASE}/images/hero/${code}_s.png`;
export const bossIcon = (n: number) => `${BASE}/expedition/images/boss/boss0${n}.png`; // expedition bosses 1 to 5
export const skillIcon = (heroCode: string, n: number) => `${BASE}/images/skill/sk_${heroCode}_${n}.png`; // n = 1 to 3
export const heroPortrait = (code: string) => `${BASE}/images/hero/portrait/${code}.png`;
export const artifactIcon = (code: string) => `${BASE}/wearingStatus/images/artifact/${code}_ico.png`;
export const setIcon = (code: string) => `${BASE}/wearingStatus/images/sets/${code}.png`;
