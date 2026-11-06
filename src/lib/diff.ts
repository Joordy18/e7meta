export type DiffPart = { kind: 'same' | 'del' | 'add'; text: string };

/**
 * Word-level difference between two texts (line breaks count as spaces): the common words, the words only in `before` ("del") and the
 * words only in `after` ("add"). In a changed stretch the removed words come first, then the added ones.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean);
  const b = after.split(/\s+/).filter(Boolean);
  // longest common subsequence table, then walk it forward
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
  const out: DiffPart[] = [];
  let del: string[] = [];
  let add: string[] = [];
  let same: string[] = [];
  const flushChanges = () => {
    if (del.length) out.push({ kind: 'del', text: del.join(' ') });
    if (add.length) out.push({ kind: 'add', text: add.join(' ') });
    del = []; add = [];
  };
  const flushSame = () => { if (same.length) out.push({ kind: 'same', text: same.join(' ') }); same = []; };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { flushChanges(); same.push(a[i]); i++; j++; }
    else if (j < b.length && (i === a.length || lcs[i][j + 1] >= lcs[i + 1][j])) { flushSame(); add.push(b[j]); j++; }
    else { flushSame(); del.push(a[i]); i++; }
  }
  flushChanges();
  flushSame();
  return out;
}
