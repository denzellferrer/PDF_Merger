/**
 * PDF Workbench — entry point.
 *
 * Everything runs in the browser. No file is ever uploaded anywhere.
 */

import { hasSelection, adoptPages } from './state.js';
import { render } from './render.js';
import { addFiles } from './files.js';
import { openDialog, closeDialog, runExport, syncDialog } from './dialog.js';
import { undo, selectAll, clearSelection, rotateSelected, removeSelected } from './actions.js';
import { readSession, clearSession, armPersistence } from './persist.js';
import { status } from './status.js';
import { $ } from './utils.js';

/* ---------------- toolbar ---------------- */

$('addBtn').onclick = () => $('fileInput').click();
$('browseBtn').onclick = () => $('fileInput').click();

$('fileInput').onchange = (e) => {
  addFiles(e.target.files);
  // Cleared so that picking the same file again still fires a change event.
  e.target.value = '';
};

$('undoBtn').onclick = undo;
$('selectAllBtn').onclick = selectAll;
$('clearSelBtn').onclick = clearSelection;
$('rotateBtn').onclick = rotateSelected;
$('removeBtn').onclick = removeSelected;

/* ---------------- export dialog ---------------- */

$('exportBtn').onclick = () => openDialog('pdf');
$('convertBtn').onclick = () => openDialog('png');
$('dlgCancel').onclick = closeDialog;
$('dlgGo').onclick = runExport;
$('fmt').onchange = syncDialog;
$('scrim').onclick = (e) => { if (e.target === $('scrim')) closeDialog(); };

$('dpi').oninput = (e) => { $('dpiOut').textContent = e.target.value + ' DPI'; };
$('quality').oninput = (e) => { $('qualityOut').textContent = e.target.value + '%'; };

/* ---------------- drag and drop onto the window ---------------- */

// dragenter/dragleave fire for every child element the pointer crosses, so the
// events are counted rather than treated as a simple on/off.
let dragDepth = 0;

window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  dragDepth++;
  document.body.classList.add('dragging');
});

window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});

window.addEventListener('dragover', (e) => {
  if (e.dataTransfer.types.includes('Files')) e.preventDefault();
});

window.addEventListener('drop', (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  addFiles(e.dataTransfer.files);
});

/* ---------------- keyboard ---------------- */

document.addEventListener('keydown', (e) => {
  // While the dialog is open it swallows everything except Escape.
  if (!$('scrim').hidden) {
    if (e.key === 'Escape') closeDialog();
    return;
  }

  // `e.key` is absent on some composition events, so it is never assumed.
  const key = e.key || '';

  if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }

  if (key === 'Delete' && hasSelection()) removeSelected();
  if (key === 'Escape') clearSelection();
});

/* ---------------- restoring the previous session ---------------- */

/**
 * Offers back whatever was on the workbench when the tab was last closed.
 *
 * The offer is deliberate rather than automatic: reopening the tool and being
 * handed somebody's half-sorted pile of documents unannounced is worse than
 * one click. Storage writes stay held back until this resolves either way, so
 * nothing overwrites the saved session before it has been offered.
 */
async function offerRestore() {
  let saved = null;
  try {
    saved = await readSession();
  } catch {
    saved = null;
  }

  if (!saved) {
    armPersistence();
    return;
  }

  const n = saved.pages.length;
  const when = new Date(saved.savedAt).toLocaleString();
  $('restoreDetail').textContent =
    n + ' page' + (n > 1 ? 's' : '') + ' from ' + when + ', still on this computer.';
  $('restoreBar').hidden = false;

  $('restoreBtn').onclick = () => {
    adoptPages(saved.pages);
    armPersistence();
    $('restoreBar').hidden = true;
    render();
    status('Restored ' + n + ' page' + (n > 1 ? 's' : '') + '.');
  };

  $('discardBtn').onclick = () => {
    $('restoreBar').hidden = true;
    clearSession();
    armPersistence();
  };
}

render();
offerRestore();
