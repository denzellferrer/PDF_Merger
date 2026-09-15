/**
 * Central store for the page list, the selection and the undo history.
 *
 * A page tile is one of:
 *   { id, type:'pdf',   srcId, srcName, bytes, pageIndex, rotation, selected }
 *   { id, type:'image', srcId, srcName, bytes, mime,      rotation, selected }
 *
 * `bytes` is shared by every page that came out of the same file, which is what
 * lets the PDF exporter and the pdf.js cache keep one parsed document per
 * source file. `srcId` names that same grouping in a form that survives being
 * written to disk, which is what session persistence restores from.
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

/** A stable id for one source file, unique across sessions. */
export const newSourceId = () =>
  'src-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

export const getLastClicked = () => lastClicked;
export const setLastClicked = (id) => { lastClicked = id; };

export const historyDepth = () => history.length;

/**
 * Replaces the whole page list with one built elsewhere — currently only the
 * restored session. History is cleared, since there is nothing to undo back to,
 * and the id counter is moved past anything restored so newly added pages
 * cannot collide with it.
 */
export function adoptPages(next) {
  pages = next;
  history = [];
  lastClicked = null;
  uid = next.reduce((max, p) => Math.max(max, p.id), 0);
}

/**
 * Records the current page list so it can be restored later. Page objects are
 * copied shallowly — `bytes` is deliberately shared rather than cloned, so a
 * snapshot costs almost nothing no matter how large the source files are.
 *
 * @returns {object} a token to hand back to `dropSnapshot` if the action that
 *   prompted the snapshot turns out to change nothing.
 */
export function snapshot(label) {
  const entry = { label, pages: pages.map((p) => ({ ...p })) };
  history.push(entry);
  if (history.length > HISTORY_LIMIT) history.shift();
  return entry;
}

/**
 * Throws away a snapshot for an action that turned out to be a no-op.
 *
 * The entry is matched by identity rather than simply popped: reading files is
 * async, so a second `addFiles` can push its own snapshot while the first is
 * still awaiting, and a blind `pop()` would discard the wrong one.
 *
 * @param {object} entry  the value returned by `snapshot`
 */
export function dropSnapshot(entry) {
  const i = history.lastIndexOf(entry);
  if (i > -1) history.splice(i, 1);
}

/** Restores the most recent snapshot. Returns its label, or null if there was nothing to undo. */
export function restoreSnapshot() {
  const prev = history.pop();
  if (!prev) return null;
  pages = prev.pages;
  lastClicked = null;
  return prev.label;
}
