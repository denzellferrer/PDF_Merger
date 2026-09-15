/** Toolbar-level actions on the page list. */

import { getPages, setPages, getSelected, snapshot, restoreSnapshot } from './state.js';
import { status } from './status.js';
import { render } from './render.js';

export function undo() {
  const label = restoreSnapshot();
  if (!label) return;
  render();
  status('Undid: ' + label + '.');
}

export function selectAll() {
  getPages().forEach((p) => { p.selected = true; });
  render();
}

export function clearSelection() {
  getPages().forEach((p) => { p.selected = false; });
  render();
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
