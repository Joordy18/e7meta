// Official art, hotlinked from the game's public guide CDN (not stored in this repo).
const BASE = 'https://static-pubcomm.onstove.com/event/live/epic7/guide';

export const heroPortrait = (code: string) => `${BASE}/images/hero/portrait/${code}.png`;
export const artifactIcon = (code: string) => `${BASE}/wearingStatus/images/artifact/${code}_ico.png`;
export const setIcon = (code: string) => `${BASE}/wearingStatus/images/sets/${code}.png`;
