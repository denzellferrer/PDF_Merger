/**
 * pdf.js setup.
 *
 * The worker is imported as a raw string and handed to the browser as a blob
 * URL rather than being fetched from a separate file. That keeps the whole app
 * working from a single `file://` HTML document with no server and no network,
 * which is the point of this tool.
 */

// pdfjs-dist 3.x ships a UMD bundle. Importing the names explicitly rather than
// as a namespace means the build fails loudly if the CommonJS interop ever
// stops resolving them, instead of breaking silently in the browser.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
import workerSource from 'pdfjs-dist/build/pdf.worker.min.js?raw';

const workerBlob = new Blob([workerSource], { type: 'application/javascript' });
GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);

/**
 * One parsed document per source file.
 *
 * Every page tile from the same file shares one `bytes` reference, so that
 * reference is the cache key. Without this, drawing the grid for a 200-page PDF
 * copied the whole file and re-parsed it 200 times.
 *
 * A WeakMap rather than a Map: once every page from a file has been removed and
 * its `bytes` is unreachable, the cached document goes with it.
 *
 * @type {WeakMap<Uint8Array, Promise<import('pdfjs-dist').PDFDocumentProxy>>}
 */
const docs = new WeakMap();

/**
 * Opens a PDF from a byte array, reusing an already-parsed document when the
 * same source file has been opened before.
 *
 * pdf.js takes ownership of the buffer it is handed and detaches it, so the
 * first call gets its own copy — the original `bytes` stays reusable for
 * exports and re-reads.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<import('pdfjs-dist').PDFDocumentProxy>}
 */
export function loadPdf(bytes) {
  const cached = docs.get(bytes);
  if (cached) return cached;

  const pending = getDocument({ data: bytes.slice() }).promise;

  // A failed parse is not cached, so a later attempt can try again rather than
  // replaying the same rejection forever.
  pending.catch(() => docs.delete(bytes));

  docs.set(bytes, pending);
  return pending;
}
