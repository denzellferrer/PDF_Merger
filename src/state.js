/**
 * Central store for the page list, the selection and the undo history.
 *
 * A page tile is one of:
 *   { id, type:'pdf',   srcName, bytes, pageIndex, rotation, selected }
 *   { id, type:'image', srcName, bytes, mime,      rotation, selected }
 *
 * `bytes` is shared by every page that came out of the same file, which is
 * what lets the PDF exporter cache a parsed document per source file.
 */

const HISTORY_LIMIT = 40;

let pages = [];
let history = [];
let uid = 0;
let lastClicked = null;

export const getPages = () => pages;
export const setPages = (next) => { pages = next; };

export const getSelected = () => pages.filter((p) => p.selected);
export const selectedCount = () => getSelected().length;
export const hasSelection = () => pages.some((p) => p.selected);

export const nextId = () => ++uid;

export const getLastClicked = () => lastClicked;
export const setLastClicked = (id) => { lastClicked = id; };

export const historyDepth = () => history.length;

/**
 * Records the current page list so it can be restored later. Page objects are
 * copied shallowly — `bytes` is deliberately shared rather than cloned, so a
 * snapshot costs almost nothing no matter how large the source files are.
 */
export function snapshot(label) {
  history.push({ label, pages: pages.map((p) => ({ ...p })) });
  if (history.length > HISTORY_LIMIT) history.shift();
}

/** Throws away the most recent snapshot, for actions that turned out to be no-ops. */
export function dropSnapshot() {
  history.pop();
}

/** Restores the most recent snapshot. Returns its label, or null if there was nothing to undo. */
export function restoreSnapshot() {
  const prev = history.pop();
  if (!prev) return null;
  pages = prev.pages;
  lastClicked = null;
  return prev.label;
}
