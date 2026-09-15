/** The export dialog: format choice, options, and kicking off the export. */

import { getPages, getSelected, selectedCount, hasSelection } from './state.js';
import { status } from './status.js';
import { exportPdf } from './exporters/pdf.js';
import { exportImages } from './exporters/images.js';
import { exportText } from './exporters/text.js';
import { $ } from './utils.js';

const NOTES = {
  pdf: 'Pages are combined into a single PDF in the order shown.',
  png: 'Lossless, supports transparency. Larger files than JPG.',
  jpeg: 'Smaller files, no transparency. Best for scans and photos.',
  webp: 'Smaller than both PNG and JPG. Not supported by some older software.',
  txt: 'Extracts the text layer. Scanned pages with no text layer will come out empty \u2014 this does not do OCR.',
};

export function syncDialog() {
  const fmt = $('fmt').value;

  $('fmtNote').textContent = NOTES[fmt];
  $('dpiField').hidden = fmt === 'pdf' || fmt === 'txt';
  $('qualityField').hidden = fmt !== 'jpeg' && fmt !== 'webp';

  const sel = selectedCount();
  const selOption = $('scope').options[1];
  selOption.disabled = sel === 0;
  selOption.textContent = sel
    ? 'Selected pages only (' + sel + ')'
    : 'Selected pages only \u2014 none selected';
}

export function openDialog(preset) {
  if (!getPages().length) return;

  $('fmt').value = preset || 'pdf';
  $('scope').value = hasSelection() ? 'sel' : 'all';
  syncDialog();

  $('scrim').hidden = false;
  $('fmt').focus();
}

export function closeDialog() {
  $('scrim').hidden = true;
}

export async function runExport() {
  const fmt = $('fmt').value;
  const scope = $('scope').value;
  const dpi = Number($('dpi').value);
  const quality = Number($('quality').value) / 100;

  const list = scope === 'sel' ? getSelected() : getPages();
  if (!list.length) {
    status('No pages selected.', true);
    return;
  }

  closeDialog();
  status('Working\u2026', false, 0);

  try {
    if (fmt === 'pdf') {
      const n = await exportPdf(list);
      status('Exported ' + n + ' page' + (n > 1 ? 's' : '') + ' as PDF.');
    } else if (fmt === 'txt') {
      const r = await exportText(list);
      status(
        r.empty
          ? 'Exported text from ' + r.count + ' pages \u2014 ' + r.empty + ' had no text layer.'
          : 'Exported text from ' + r.count + ' page' + (r.count > 1 ? 's' : '') + '.',
        false,
        r.empty ? 6000 : 3200,
      );
    } else {
      const n = await exportImages(list, 'image/' + fmt, dpi, quality);
      status('Exported ' + n + ' image' + (n > 1 ? 's' : '') + (n > 1 ? ' as a zip.' : '.'));
    }
  } catch (e) {
    status('Export failed: ' + e.message, true, 7000);
  }
}
