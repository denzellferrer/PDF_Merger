/** Drawing the page grid, the tiles and their thumbnails. */

import {
  getPages, setPages, selectedCount, historyDepth,
  getLastClicked, setLastClicked, snapshot,
} from './state.js';
import { loadPdf } from './pdfjs.js';
import { imageToBoxCanvas } from './exporters/canvas.js';
import { saveSessionSoon } from './persist.js';
import { escapeHtml, $ } from './utils.js';

const THUMB_W = 220;
const THUMB_H = 290;

// Thumbnails are drawn at the screen's real pixel density so they are not soft
// on a HiDPI display. Capped at 2, past which the memory each tile costs grows
// faster than the sharpness anyone can see.
const DPR = Math.min(window.devicePixelRatio || 1, 2);

/**
 * Rasterised thumbnails, keyed by page id and rotation.
 *
 * Without this, every re-render — including one caused by clicking a single
 * tile — re-rasterised the whole grid. `inflight` holds the jobs that have not
 * finished yet, so two renders in quick succession share one render pass
 * rather than racing each other.
 *
 * @type {Map<string, HTMLCanvasElement>}
 */
const ready = new Map();
/** @type {Map<string, Promise<HTMLCanvasElement>>} */
const inflight = new Map();

const thumbKey = (p) => p.id + ':' + p.rotation;

/**
 * Full rebuild of the grid. Use this for anything that changes which pages
 * exist or what order they are in; for a selection change use `syncChrome`,
 * which does not touch the tiles at all.
 */
export function render() {
  const pages = getPages();
  const has = pages.length > 0;

  $('dropzone').hidden = has;
  $('gridWrap').hidden = !has;
  // The offer to restore a session only makes sense on an empty workbench.
  if (has) $('restoreBar').hidden = true;

  $('grid').replaceChildren(...pages.map((p, idx) => tile(p, idx)));

  pruneThumbs(pages);
  syncChrome();
  saveSessionSoon(pages);
}

/**
 * Updates everything that depends on the selection — tile highlights, the page
 * count and the toolbar — without rebuilding a single tile.
 */
export function syncChrome() {
  const pages = getPages();
  const has = pages.length > 0;
  const sel = selectedCount();

  const byId = new Map(pages.map((p) => [p.id, p]));
  for (const el of $('grid').children) {
    const p = byId.get(Number(el.dataset.id));
    if (p) el.classList.toggle('selected', p.selected);
  }

  $('count').textContent = has
    ? pages.length + ' page' + (pages.length > 1 ? 's' : '') + (sel ? ' · ' + sel + ' selected' : '')
    : '';

  $('exportBtn').disabled = !has;
  $('convertBtn').disabled = !has;
  $('selectAllBtn').disabled = !has;
  $('clearSelBtn').disabled = !sel;
  $('rotateBtn').disabled = !sel;
  $('removeBtn').disabled = !sel;
  $('undoBtn').disabled = historyDepth() === 0;
}

/** Drops cached thumbnails for pages that are gone, and for stale rotations. */
function pruneThumbs(pages) {
  const live = new Set(pages.map(thumbKey));
  for (const key of ready.keys()) if (!live.has(key)) ready.delete(key);
}

function tile(p, idx) {
  const el = document.createElement('div');
  el.className = 'page' + (p.selected ? ' selected' : '');
  el.draggable = true;
  el.dataset.id = p.id;
  el.tabIndex = 0;

  // Mounting ears. Decorative only — they carry no state and no handlers, and
  // sit outside the flex column so they do not affect layout.
  el.insertAdjacentHTML(
    'beforeend',
    '<span class="ear left" aria-hidden="true"><span class="screw"></span><span class="screw"></span></span>' +
    '<span class="ear right" aria-hidden="true"><span class="screw"></span><span class="screw"></span></span>',
  );

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  el.appendChild(thumb);

  el.appendChild(pageBar(p, idx));

  el.onclick = (e) => selectOnClick(e, p);
  attachDragHandlers(el, p);

  showThumb(p, thumb);
  return el;
}

function pageBar(p, idx) {
  const bar = document.createElement('div');
  bar.className = 'page-bar';
  // Rack-unit numbering, per the site's design system. It is the page's
  // position in the export order, which is the whole point of the grid, so the
  // U-prefix labels something real rather than decorating the number.
  const unit = 'U' + String(idx + 1).padStart(2, '0');

  bar.innerHTML =
    '<span class="led unit-led" aria-hidden="true"></span>' +
    '<span class="page-num">' + unit + '</span>' +
    '<span class="page-src" title="' + escapeHtml(p.srcName) + '">' + escapeHtml(p.srcName) + '</span>';

  const rot = document.createElement('button');
  rot.className = 'icon-btn';
  rot.title = 'Rotate this page';
  rot.textContent = '↻';
  rot.onclick = (e) => {
    e.stopPropagation();
    snapshot('rotate page');
    p.rotation = (p.rotation + 90) % 360;
    render();
  };

  const del = document.createElement('button');
  del.className = 'icon-btn remove';
  del.title = 'Remove this page';
  del.textContent = '✕';
  del.onclick = (e) => {
    e.stopPropagation();
    snapshot('remove page');
    setPages(getPages().filter((x) => x.id !== p.id));
    render();
  };

  bar.appendChild(rot);
  bar.appendChild(del);
  return bar;
}

function selectOnClick(e, p) {
  const pages = getPages();
  const anchor = getLastClicked();

  if (e.shiftKey && anchor !== null) {
    const a = pages.findIndex((x) => x.id === anchor);
    const b = pages.findIndex((x) => x.id === p.id);
    if (a > -1 && b > -1) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      for (let i = lo; i <= hi; i++) pages[i].selected = true;
    }
  } else {
    p.selected = !p.selected;
    setLastClicked(p.id);
  }
  // Only the highlight and the toolbar change, so the tiles are left alone.
  syncChrome();
}

function attachDragHandlers(el, p) {
  el.ondragstart = (e) => {
    e.dataTransfer.setData('text/plain', String(p.id));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => el.classList.add('lifting'), 0);
  };
  el.ondragend = () => el.classList.remove('lifting');
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('drag-over'); };
  el.ondragleave = () => el.classList.remove('drag-over');

  el.ondrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');

    const draggedId = Number(e.dataTransfer.getData('text/plain'));
    if (!draggedId || draggedId === p.id) return;

    const pages = getPages();
    const from = pages.findIndex((x) => x.id === draggedId);
    const to = pages.findIndex((x) => x.id === p.id);
    if (from < 0 || to < 0) return;

    snapshot('reorder');
    const moved = pages.splice(from, 1)[0];
    pages.splice(to, 0, moved);
    render();
  };
}

/** Puts a thumbnail in the tile, from cache when one has already been drawn. */
function showThumb(p, host) {
  const key = thumbKey(p);

  const cached = ready.get(key);
  if (cached) {
    // Re-appending moves the canvas out of the tile the last render built.
    host.replaceChildren(cached);
    return;
  }

  host.innerHTML = '<span class="loading">…</span>';

  let job = inflight.get(key);
  if (!job) {
    job = drawThumb(p).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }

  job.then((canvas) => {
    ready.set(key, canvas);
    // The grid may have been rebuilt while this was rendering, in which case a
    // newer tile is already waiting on the same job and will take the canvas.
    if (host.isConnected) host.replaceChildren(canvas);
  }).catch(() => {
    if (host.isConnected) host.innerHTML = '<span class="loading">No preview</span>';
  });
}

/** Rasterises one page to a canvas sized to fit inside the tile. */
async function drawThumb(p) {
  if (p.type === 'image') {
    return forDisplay(await imageToBoxCanvas(p, THUMB_W, THUMB_H, DPR));
  }

  const doc = await loadPdf(p.bytes);
  const page = await doc.getPage(p.pageIndex + 1);

  // pdf.js *replaces* the page's own rotation rather than adding to it, so the
  // two are combined here — otherwise a source page that already carries a
  // /Rotate would preview upright while exporting sideways.
  const rotation = (page.rotate + p.rotation) % 360;

  // Measured with the rotation applied, so a quarter-turned page is fitted by
  // its turned dimensions instead of overflowing the tile.
  const base = page.getViewport({ scale: 1, rotation });
  const fit = Math.min(THUMB_W / base.width, THUMB_H / base.height);
  const vp = page.getViewport({ scale: fit * DPR, rotation });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

  return forDisplay(canvas);
}

/** Pins a canvas's CSS size to its pixel size divided by the pixel ratio. */
function forDisplay(canvas) {
  canvas.style.width = canvas.width / DPR + 'px';
  canvas.style.height = canvas.height / DPR + 'px';
  return canvas;
}
