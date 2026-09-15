/** Rasterising a page to a canvas, shared by the image and PDF exporters. */

import { loadPdf } from '../pdfjs.js';

export function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode image'))),
      mime,
      quality,
    );
  });
}

/**
 * Draws an imported image onto a canvas at `scale`, applying its rotation.
 * @param {object} p      page record with type 'image'
 * @param {number} scale  multiplier on the image's native pixel size
 */
export async function imageToCanvas(p, scale) {
  const blob = new Blob([p.bytes], { type: p.mime });
  const bmp = await createImageBitmap(blob);

  const rot = p.rotation % 360;
  const swap = rot === 90 || rot === 270;
  const w = Math.round((swap ? bmp.height : bmp.width) * scale);
  const h = Math.round((swap ? bmp.width : bmp.height) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  ctx.translate(w / 2, h / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(
    bmp,
    (-bmp.width * scale) / 2, (-bmp.height * scale) / 2,
    bmp.width * scale, bmp.height * scale,
  );

  bmp.close();
  return canvas;
}

/**
 * Renders one PDF page to a canvas at the given resolution.
 * @param {object} p    page record with type 'pdf'
 * @param {number} dpi
 */
export async function pdfPageToCanvas(p, dpi) {
  const doc = await loadPdf(p.bytes);
  const page = await doc.getPage(p.pageIndex + 1);

  // PDF user space is 72 units per inch, so that ratio is the render scale.
  const vp = page.getViewport({ scale: dpi / 72, rotation: p.rotation });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);

  const ctx = canvas.getContext('2d');
  // JPG and WebP have no alpha channel, so transparent areas would come out
  // black without a white ground laid down first.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}
