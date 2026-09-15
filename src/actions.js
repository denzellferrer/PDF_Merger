/** Toolbar-level actions on the page list. */

import { getPages, setPages, getSelected, snapshot, restoreSnapshot } from './state.js';
import { status } from './status.js';
import { render, syncChrome } from './render.js';

export function undo() {
  const label = restoreSnapshot();
  if (!label) return;
  render();
  status('Undid: ' + label + '.');
}

export function selectAll() {
  getPages().forEach((p) => { p.selected = true; });
  // Selection does not change what any tile shows, so the grid is left as it is.
  syncChrome();
}

export function clearSelection() {
  getPages().forEach((p) => { p.selected = false; });
  syncChrome();
}

export function rotateSelected() {
  snapshot('rotate pages');
  getSelected().forEach((p) => { p.rotation = (p.rotation + 90) % 360; });
  render();
}

export function removeSelected() {
  const n = getSelected().length;
  snapshot('remove ' + n + ' page' + (n > 1 ? 's' : ''));
  setPages(getPages().filter((p) => !p.selected));
  render();
  status(n + ' page' + (n > 1 ? 's' : '') + ' removed. Ctrl+Z to undo.', false, 4500);
}
