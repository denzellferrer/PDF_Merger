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
  pdfjs.js              pdf.js setup + inlined worker + document cache
  persist.js            session storage in IndexedDB
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
{ id, type:'pdf',   srcId, srcName, bytes, pageIndex, rotation, selected }
{ id, type:'image', srcId, srcName, bytes, mime,      rotation, selected }
```

Every page from the same source file shares one `bytes` reference. That is deliberate and load-bearing in three places: undo snapshots copy page objects shallowly, so a snapshot is nearly free regardless of file size; the PDF exporter caches parsed documents keyed on `bytes`; and `loadPdf` keeps one pdf.js document per `bytes` in a `WeakMap`, so a 400-page source file is parsed once, not 400 times.

`srcId` names that same grouping in a form that survives being written to disk. It is what session persistence stores file bytes against, and restoring rebuilds the shared-`bytes` invariant from it — if a restore ever handed each page its own copy, both caches above would quietly stop working.

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

### How rendering works

Two entry points, and using the wrong one is the easiest way to make the grid slow again:

- `render()` rebuilds every tile. Use it when the set of pages or their order changes — add, remove, reorder, rotate, undo.
- `syncChrome()` updates only the selection highlights, the page count and the toolbar buttons. Use it for anything that leaves the tiles themselves alone.

Selection goes through `syncChrome()`, so clicking a tile touches no DOM beyond a class toggle. Rasterised thumbnails are cached in `render.js` keyed on page id **and** rotation, so a `render()` re-appends the canvases it already has rather than redrawing them; `inflight` de-duplicates jobs so two renders in quick succession share one render pass. Together with the pdf.js document cache, clicking a tile in a 200-page document costs nothing, where it previously meant 200 document parses and 200 rasterisations.

Thumbnails are drawn at `devicePixelRatio` (capped at 2) and their CSS size is pinned to pixel size ÷ ratio, so they are sharp on HiDPI screens without laying out any larger.

**Rotation is additive, and pdf.js does not do that for you.** `page.getViewport({ rotation })` *replaces* the page's own `/Rotate` rather than adding to it, so both `render.js` and `exporters/canvas.js` pass `(page.rotate + p.rotation) % 360`. Passing `p.rotation` alone silently straightens any source page that arrived pre-rotated — and it does so only in the raster paths, so the page would preview upright while the merged PDF came out sideways.

## Session persistence

The working session — the page list, the order, the rotations and the source file bytes — is written to IndexedDB, and is offered back on the next visit through a bar above the dropzone. Restoring is one click, and so is discarding.

The offer is deliberate rather than automatic: being handed somebody's half-sorted pile of documents unannounced is worse than one click.

Three things about `src/persist.js` are worth knowing:

- **Writes are gated behind `armPersistence()`.** The first `render()` happens on an empty page list, and without the gate it would overwrite the stored session before it could be offered. Startup arms it once it has restored or discarded; adding a file arms it too, since that plainly starts a new session.
- **Sources and the page list are stored separately.** The page list is a few hundred bytes and is rewritten (debounced) on every edit; file bytes can be hundreds of megabytes and are written once per file and never rewritten. Saving prunes sources no page refers to any more.
- **Every entry point degrades to a no-op.** IndexedDB is unavailable on `file://` origins in most browsers — which is exactly how the built single-file build is meant to be opened — so a failure to open, a quota rejection, or an open that simply hangs all just disable storage. The workbench itself never depends on it.

That last point is the tradeoff to be aware of: **session restore works when the tool is served over `http(s)`, and is silently absent when `dist/index.html` is opened directly from disk.** Everything else about the tool works identically either way.

## Browser support

Needs `createImageBitmap`, `canvas.toBlob` and ES2020. Current Chrome, Edge, Firefox and Safari are all fine. WebP *export* depends on the browser's encoder — Safari gained it in 14.

## Verification

The built file was tested in headless Chromium from a `file://` URL: importing a PDF, thumbnail rendering through the inlined worker, rotation, undo, and all four export formats, with the outputs reopened and checked. Importing PNG, JPG and WebP and merging them to PDF — which exercises the WebP-to-PNG re-encode, since pdf-lib embeds only PNG and JPG — was verified the same way.

The caching, rotation and persistence work was verified against `dist/index.html` served over HTTP, using a 3-page PDF whose third page carries `/Rotate 90` and a 400×150 PNG:

- selecting a tile rebuilds no DOM at all and reuses every canvas node; reordering rebuilds tiles but recycles every cached canvas with no placeholder flash
- the pre-rotated third page renders landscape (220×155) rather than being straightened, and a user rotation of the wide PNG produces a real portrait canvas (109×290) that fits inside its tile, with no CSS transform
- a reload offers the stored session with the right page count and timestamp; restoring brings back order, rotations and working thumbnails, and exports a valid merged PDF from the restored bytes; discarding empties both stores

One caveat on testing in an automated browser: pdf.js schedules its render continuations on `requestAnimationFrame`, so in a tab that is never painted `page.render()` never settles and thumbnails hang on the placeholder forever. That is the harness, not the app. Shim `requestAnimationFrame` onto `setTimeout` before driving the page.
