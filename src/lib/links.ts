import { normalize } from './data';

/** Page of a hero on epic7db.com (a fan site, not the game's): its slug is the name in lower case, words joined by dashes. */
export const epic7dbUrl = (heroName: string) =>
  `https://epic7db.com/heroes/${normalize(heroName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
