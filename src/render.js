/** Drawing the page grid, the tiles and their thumbnails. */

import {
  getPages, setPages, selectedCount, historyDepth,
  getLastClicked, setLastClicked, snapshot,
} from './state.js';
import { loadPdf } from './pdfjs.js';
import { escapeHtml, $ } from './utils.js';

const THUMB_W = 220;
const THUMB_H = 290;

export function render() {
  const pages = getPages();
  const has = pages.length > 0;

  $('dropzone').hidden = has;
  $('gridWrap').hidden = !has;

  const grid = $('grid');
  grid.innerHTML = '';
  pages.forEach((p, idx) => grid.appendChild(tile(p, idx)));

  const sel = selectedCount();
  $('count').textContent = has
    ? pages.length + ' page' + (pages.length > 1 ? 's' : '') + (sel ? ' \u00b7 ' + sel + ' selected' : '')
    : '';

  $('exportBtn').disabled = !has;
  $('convertBtn').disabled = !has;
  $('selectAllBtn').disabled = !has;
  $('clearSelBtn').disabled = !sel;
  $('rotateBtn').disabled = !sel;
  $('removeBtn').disabled = !sel;
  $('undoBtn').disabled = historyDepth() === 0;
}

function tile(p, idx) {
  const el = document.createElement('div');
  el.className = 'page' + (p.selected ? ' selected' : '');
  el.draggable = true;
  el.dataset.id = p.id;
  el.tabIndex = 0;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.innerHTML = '<span class="loading">\u2026</span>';
  el.appendChild(thumb);

  el.appendChild(pageBar(p, idx));

  el.onclick = (e) => selectOnClick(e, p);
  attachDragHandlers(el, p);

  drawThumb(p, thumb);
  return el;
}

function pageBar(p, idx) {
  const bar = document.createElement('div');
  bar.className = 'page-bar';
  bar.innerHTML =
    '<span class="page-num">' + (idx + 1) + '</span>' +
    '<span class="page-src" title="' + escapeHtml(p.srcName) + '">' + escapeHtml(p.srcName) + '</span>';

  const rot = document.createElement('button');
  rot.className = 'icon-btn';
  rot.title = 'Rotate this page';
  rot.textContent = '\u21bb';
  rot.onclick = (e) => {
    e.stopPropagation();
    snapshot('rotate page');
    p.rotation = (p.rotation + 90) % 360;
    render();
  };

  const del = document.createElement('button');
  del.className = 'icon-btn remove';
  del.title = 'Remove this page';
  del.textContent = '\u2715';
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
  render();
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

async function drawThumb(p, host) {
  try {
    if (p.type === 'image') {
      const blob = new Blob([p.bytes], { type: p.mime });
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      img.style.transform = 'rotate(' + p.rotation + 'deg)';
      host.innerHTML = '';
      host.appendChild(img);
      return;
    }

    const doc = await loadPdf(p.bytes);
    const page = await doc.getPage(p.pageIndex + 1);

    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(THUMB_W / base.width, THUMB_H / base.height);
    const vp = page.getViewport({ scale, rotation: p.rotation });

    const canvas = document.createElement('canvas');
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    host.innerHTML = '';
    host.appendChild(canvas);
  } catch {
    host.innerHTML = '<span class="loading">No preview</span>';
  }
}
