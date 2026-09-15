/** Renders each page to a raster image; several pages come back as a zip. */

import JSZip from 'jszip';
import { imageToCanvas, pdfPageToCanvas, canvasToBlob } from './canvas.js';
import { download, stamp, baseName } from '../utils.js';
import { status } from '../status.js';

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/png': 'png',
};

export async function exportImages(list, mime, dpi, quality) {
  const ext = EXTENSIONS[mime] ?? 'png';
  // PNG is lossless, so the quality slider does not apply to it.
  const q = mime === 'image/png' ? undefined : quality;

  const files = [];

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    status('Rendering page ' + (i + 1) + ' of ' + list.length + '\u2026', false, 0);

    const canvas = p.type === 'image'
      ? await imageToCanvas(p, dpi / 96) // screen images are nominally 96 DPI
      : await pdfPageToCanvas(p, dpi);

    const blob = await canvasToBlob(canvas, mime, q);
    const num = String(i + 1).padStart(3, '0');
    files.push({ name: num + '-' + baseName(p.srcName) + '.' + ext, blob });
  }

  if (files.length === 1) {
    download(files[0].blob, files[0].name);
  } else {
    status('Zipping ' + files.length + ' images\u2026', false, 0);
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.name, f.blob));
    // Already-compressed image data, so storing is faster and no larger.
    const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    download(out, 'pages-' + stamp() + '.zip');
  }

  return files.length;
}
