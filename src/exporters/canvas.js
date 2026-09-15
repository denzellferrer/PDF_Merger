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
 * Draws a decoded bitmap onto a new canvas at `scale`, turned by `rotation`.
 *
 * The canvas takes the rotated dimensions, so a quarter-turned landscape image
 * comes out as a portrait canvas rather than overflowing a landscape one.
 *
 * @param {ImageBitmap} bmp
 * @param {number} rotation  degrees, a multiple of 90
 * @param {number} scale     multiplier on the bitmap's native pixel size
 */
function drawRotated(bmp, rotation, scale) {
  const rot = ((rotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((swap ? bmp.height : bmp.width) * scale));
  canvas.height = Math.max(1, Math.round((swap ? bmp.width : bmp.height) * scale));

  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(
    bmp,
    (-bmp.width * scale) / 2, (-bmp.height * scale) / 2,
    bmp.width * scale, bmp.height * scale,
  );

  return canvas;
}

function bitmapFor(p) {
  return createImageBitmap(new Blob([p.bytes], { type: p.mime }));
}

/**
 * Draws an imported image onto a canvas at `scale`, applying its rotation.
 * @param {object} p      page record with type 'image'
 * @param {number} scale  multiplier on the image's native pixel size
 */
export async function imageToCanvas(p, scale) {
  const bmp = await bitmapFor(p);
  try {
    return drawRotated(bmp, p.rotation, scale);
  } finally {
    bmp.close();
  }
}

/**
 * Draws an imported image scaled to fit inside a box, applying its rotation.
 * The box is measured after rotation, so the result never overflows it.
 *
 * @param {object} p     page record with type 'image'
 * @param {number} boxW  box width in CSS pixels
 * @param {number} boxH  box height in CSS pixels
 * @param {number} dpr   device pixel ratio to render at
 */
export async function imageToBoxCanvas(p, boxW, boxH, dpr = 1) {
  const bmp = await bitmapFor(p);
  try {
    const rot = ((p.rotation % 360) + 360) % 360;
    const swap = rot === 90 || rot === 270;
    const shownW = swap ? bmp.height : bmp.width;
    const shownH = swap ? bmp.width : bmp.height;

    // Never enlarged past its native size — an upscaled thumbnail only costs
    // memory, it does not show more detail.
    const fit = Math.min(boxW / shownW, boxH / shownH, 1);
    return drawRotated(bmp, rot, fit * dpr);
  } finally {
    bmp.close();
  }
}

/**
 * Renders one PDF page to a canvas at the given resolution.
 * @param {object} p    page record with type 'pdf'
 * @param {number} dpi
 */
export async function pdfPageToCanvas(p, dpi) {
  const doc = await loadPdf(p.bytes);
  const page = await doc.getPage(p.pageIndex + 1);

  // pdf.js replaces the page's own rotation with whatever is passed, so the
  // tile's rotation is added to it. Passing `p.rotation` alone would silently
  // straighten a source page that already carried a /Rotate.
  const rotation = (page.rotate + p.rotation) % 360;

  // PDF user space is 72 units per inch, so that ratio is the render scale.
  const vp = page.getViewport({ scale: dpi / 72, rotation });

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
