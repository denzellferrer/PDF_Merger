/**
 * Pulls the text layer out of each page into one .txt file.
 *
 * This reads text that is already embedded in the PDF. Scanned pages hold only
 * an image of text and will come out empty — there is no OCR here.
 */

import { loadPdf } from '../pdfjs.js';
import { download, stamp } from '../utils.js';
import { status } from '../status.js';

export async function exportText(list) {
  const parts = [];
  let empty = 0;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    status('Extracting text from page ' + (i + 1) + ' of ' + list.length + '\u2026', false, 0);

    const heading = '--- Page ' + (i + 1) + ' (' + p.srcName + ') ---\n';

    if (p.type === 'image') {
      parts.push(heading + '[image \u2014 no text to extract]\n');
      empty++;
      continue;
    }

    const doc = await loadPdf(p.bytes);
    const page = await doc.getPage(p.pageIndex + 1);
    const tc = await page.getTextContent();

    const text = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) empty++;

    parts.push(heading + (text || '[no text layer]') + '\n');
  }

  download(
    new Blob([parts.join('\n')], { type: 'text/plain;charset=utf-8' }),
    'text-' + stamp() + '.txt',
  );

  return { count: list.length, empty };
}
