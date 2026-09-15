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
 * Opens a PDF from a byte array.
 *
 * pdf.js takes ownership of the buffer it is handed and detaches it, so every
 * call gets its own copy — the original `bytes` stays reusable for later
 * thumbnails, exports and re-reads.
 *
 * @param {Uint8Array} bytes
 */
export function loadPdf(bytes) {
  return getDocument({ data: bytes.slice() }).promise;
}
