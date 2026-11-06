// The game's codes for classes and elements, in the English names players use ("assassin" is a Thief, "wind" is Earth).
const JOBS: Record<string, string> = {
  warrior: 'Warrior', knight: 'Knight', assassin: 'Thief', mage: 'Mage', ranger: 'Ranger', manauser: 'Soul Weaver',
};
const ELEMENTS: Record<string, string> = { fire: 'Fire', ice: 'Ice', wind: 'Earth', light: 'Light', dark: 'Dark' };
export const jobLabel = (c: string) => JOBS[c] ?? c;
export const elementLabel = (c: string) => ELEMENTS[c] ?? c;
export const hasJobIcon = (c: string) => c in JOBS;
export const hasElementIcon = (c: string) => c in ELEMENTS;
