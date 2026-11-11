import { rename, writeFile } from 'node:fs/promises';

/** Writes a file whole or not at all: the data goes next to it first, then is renamed over it, so a kill or a full disk never leaves a half file to be published. */
export async function writeFileAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}
