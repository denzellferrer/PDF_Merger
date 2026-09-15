/** Small shared helpers. */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Hands a blob to the browser as a download. */
export function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Today as YYYY-MM-DD, for filenames. */
export function stamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Strips the extension and anything awkward in a filename. */
export function baseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w\-. ]+/g, '_');
}

export const $ = (id) => document.getElementById(id);
