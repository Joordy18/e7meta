// The game's codes that have an official icon (the names shown for them are translated, see useLabels in src/i18n).
const JOBS = new Set(['warrior', 'knight', 'assassin', 'mage', 'ranger', 'manauser']);
const ELEMENTS = new Set(['fire', 'ice', 'wind', 'light', 'dark']);
export const hasJobIcon = (code: string) => JOBS.has(code);
export const hasElementIcon = (code: string) => ELEMENTS.has(code);
