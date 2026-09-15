/** Combines the page list into one PDF. */

import { PDFDocument, degrees } from 'pdf-lib';
import { imageToCanvas, canvasToBlob } from './canvas.js';
import { download, stamp } from '../utils.js';

export async function exportPdf(list) {
  const out = await PDFDocument.create();

  // Pages from the same source file share one `bytes` reference, so keying on
  // it means each source PDF is only parsed once no matter how many of its
  // pages are in the export.
  const cache = new Map();

  for (const p of list) {
    if (p.type === 'image') {
      await addImagePage(out, p);
    } else {
      await addPdfPage(out, p, cache);
    }
  }

  const bytes = await out.save();
  download(new Blob([bytes], { type: 'application/pdf' }), 'merged-' + stamp() + '.pdf');
  return list.length;
}

async function addImagePage(out, p) {
  let bytes = p.bytes;
  let mime = p.mime;

  // pdf-lib can embed PNG and JPG only, so WebP gets re-encoded to PNG first.
  if (mime === 'image/webp') {
    const canvas = await imageToCanvas(p, 1);
    const blob = await canvasToBlob(canvas, 'image/png', 1);
    bytes = new Uint8Array(await blob.arrayBuffer());
    mime = 'image/png';
  }

  const img = mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
  const page = out.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  if (p.rotation) page.setRotation(degrees(p.rotation));
}

async function addPdfPage(out, p, cache) {
  let src = cache.get(p.bytes);
  if (!src) {
    src = await PDFDocument.load(p.bytes);
    cache.set(p.bytes, src);
  }

  const copied = (await out.copyPages(src, [p.pageIndex]))[0];

  // The page may already carry a rotation from its source document, so the
  // tile's rotation is added to it rather than replacing it.
  if (p.rotation) {
    const current = copied.getRotation().angle;
    copied.setRotation(degrees((current + p.rotation) % 360));
  }

  out.addPage(copied);
}
