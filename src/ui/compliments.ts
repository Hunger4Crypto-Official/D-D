import { loadCompliments } from '../content/contentLoader.js';

let cache: string[] | null = null;

export function randomCompliment(): string {
  if (!cache) {
    try {
      cache = loadCompliments().lines;
    } catch (err) {
      cache = ['The Vault hums softly.'];
    }
  }
  if (!cache?.length) return 'The Vault hums softly.';
  const idx = Math.floor(Math.random() * cache.length);
  return cache[idx];
}
