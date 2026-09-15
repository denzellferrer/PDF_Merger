/** Turning dropped or chosen files into page tiles. */

import { PDFDocument } from 'pdf-lib';
import { getPages, nextId, snapshot, dropSnapshot } from './state.js';
import { status } from './status.js';
import { render } from './render.js';

const IMAGE_TYPES = /^image\/(png|jpeg|webp)$/;

export async function addFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;

  status('Reading ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '\u2026', false, 0);

  snapshot('add files');
  const pages = getPages();
  let added = 0;
  const failed = [];

  for (const file of files) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());

      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        let doc;
        try {
          doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
        } catch {
          failed.push(file.name + ' \u2014 password protected or damaged');
          continue;
        }

        const n = doc.getPageCount();
        for (let i = 0; i < n; i++) {
          pages.push({
            id: nextId(),
            type: 'pdf',
            srcName: file.name,
            bytes,
            pageIndex: i,
            rotation: 0,
            selected: false,
          });
          added++;
        }
      } else if (IMAGE_TYPES.test(file.type)) {
        pages.push({
          id: nextId(),
          type: 'image',
          srcName: file.name,
          bytes,
          mime: file.type,
          rotation: 0,
          selected: false,
        });
        added++;
      } else {
        failed.push(file.name + ' \u2014 unsupported file type');
      }
    } catch {
      failed.push(file.name + ' \u2014 could not be read');
    }
  }

  // Nothing landed, so there is nothing worth undoing.
  if (!added) dropSnapshot();
  render();

  if (failed.length && added) {
    status(added + ' pages added. Skipped: ' + failed.join('; '), true, 6500);
  } else if (failed.length) {
    status('Nothing added. ' + failed.join('; '), true, 6500);
  } else {
    status(added + ' page' + (added > 1 ? 's' : '') + ' added.');
  }
}
