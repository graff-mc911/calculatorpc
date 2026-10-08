/** Remember last opened object for field quick-add (+ Робота / Витрата / …). */

const KEY = 'cpc.lastProjectId';

export function getLastProjectId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string | null | undefined): void {
  if (typeof localStorage === 'undefined' || !id) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
