# PDF Workbench

Merge, reorder, rotate, split and convert PDFs and images — entirely in the browser. No server, no upload, no network. Files never leave the machine.

Built from a single self-contained HTML file into a Vite project, with the constraint that `npm run build` must still produce **one HTML file you can double-click**.

## Getting started

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # writes dist/index.html — one self-contained file
npm run preview  # serve the built output
```

`dist/index.html` is about 2 MB and has zero external references. Email it, drop it on a USB stick, open it from `file://` with no internet connection — it works.

In VS Code: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> runs the dev server. <kbd>F5</kbd> launches it in Chrome with the debugger attached.

## Layout

```
index.html              markup
src/
  styles.css            all styling
  main.js               entry point: event wiring, drag/drop, keyboard
  state.js              page list, selection, undo history
  render.js             grid, tiles, thumbnails
  files.js              file import -> page records
  actions.js            toolbar actions
  dialog.js             export dialog
  pdfjs.js              pdf.js setup + inlined worker
  utils.js              download, escaping, filenames
  exporters/
    canvas.js           shared rasterisation
    pdf.js              merged PDF via pdf-lib
    images.js           PNG/JPG/WebP, zipped when multiple
    text.js             text-layer extraction
```

### How state works

A page is one tile in the grid:

```js
{ id, type:'pdf',   srcName, bytes, pageIndex, rotation, selected }
{ id, type:'image', srcName, bytes, mime,      rotation, selected }
```

Every page from the same source file shares one `bytes` reference. That is deliberate and load-bearing in two places: undo snapshots copy page objects shallowly, so a snapshot is nearly free regardless of file size; and the PDF exporter caches parsed documents keyed on `bytes`, so a 400-page source file is parsed once, not 400 times.

Because the store owns the `pages` array, modules mutate it through `getPages()` / `setPages()` rather than reassigning an imported binding — ES modules do not allow the latter.

## Dependencies

Pinned to the exact versions that were inlined in the original single-file build, so behaviour is unchanged:

| Library | Version | Used for |
| --- | --- | --- |
| pdf-lib | 1.17.1 | building and merging PDFs |
| pdfjs-dist | 3.11.174 | rendering pages, extracting text |
| jszip | 3.10.1 | bundling multi-page image exports |

These are pinned exactly, not with `^`. pdfjs-dist 4.x is ESM-only with a different worker setup and would need the changes described below.

## Two things worth knowing before you change anything

**The pdf.js worker is inlined as a string.** `src/pdfjs.js` imports the worker with Vite's `?raw` suffix and hands it to the browser as a blob URL. This is what keeps the app working from `file://`. If you let Vite emit the worker as a separate file — for instance by switching to `?worker` or upgrading to pdfjs-dist 4.x — the offline single-file property breaks, and it breaks *silently*: thumbnails just stop appearing.

**pdf.js 3.x is a UMD bundle, so imports are deliberately explicit.** `src/pdfjs.js` uses named imports:

```js
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
```

not `import * as pdfjsLib`. With a namespace import the bundler synthesises a namespace object, which only works if it happens to detect every export — and when it doesn't, the failure surfaces at runtime in the browser rather than at build time. Named imports make the build fail loudly instead. Keep them.

Unrelated but expected: pdf.js uses `eval` internally, so every build prints a warning about it. It comes from upstream and is harmless.

## Known rough edge

`drawThumb` in `src/render.js` re-parses the source PDF for every tile on every render — including on a plain selection change, which re-renders the whole grid. On a 200-page document that is 200 full document parses per click.

This was carried over from the original unchanged. The fix is a document cache in `src/pdfjs.js` keyed on the `bytes` reference, mirroring what the PDF exporter already does; `pdfjs.js` exists as a module boundary partly to make that a contained change.

## Browser support

Needs `createImageBitmap`, `canvas.toBlob` and ES2020. Current Chrome, Edge, Firefox and Safari are all fine. WebP *export* depends on the browser's encoder — Safari gained it in 14.

## Verification

The built file was tested in headless Chromium from a `file://` URL: importing a PDF, thumbnail rendering through the inlined worker, rotation, undo, and all four export formats, with the outputs reopened and checked. Importing PNG, JPG and WebP and merging them to PDF — which exercises the WebP-to-PNG re-encode, since pdf-lib embeds only PNG and JPG — was verified the same way.
