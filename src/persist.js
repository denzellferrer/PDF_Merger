/**
 * Saving the working session to IndexedDB so a refresh — or a closed tab —
 * does not throw away an afternoon of sorting.
 *
 * Nothing here leaves the machine: IndexedDB is local browser storage, in the
 * same spirit as the rest of the tool.
 *
 * Two stores, because the two halves change at very different rates:
 *
 *   sources  srcId -> { name, bytes }   written once, when a file is added
 *   meta     'session' -> { pages, savedAt }
 *
 * The page list is a few hundred bytes and is rewritten on every edit; the file
 * bytes can be hundreds of megabytes and are never rewritten at all.
 *
 * IndexedDB is unavailable on `file://` origins in most browsers, so every
 * entry point here degrades to a no-op rather than throwing. The app must stay
 * usable when the built single-file HTML is opened by double-clicking it.
 */

const DB_NAME = 'pdf-workbench';
const DB_VERSION = 1;
const SOURCES = 'sources';
const META = 'meta';
const SESSION_KEY = 'session';
const SAVE_DELAY = 400;
const OPEN_TIMEOUT = 5000;

let dbPromise = null;
let disabled = false;
let saveTimer = null;

// Writing is held back until startup has decided what to do with any session
// already on disk. The very first render happens on an empty page list, and
// without this gate it would overwrite the session before it could be offered.
let armed = false;

/** Wraps an IDBRequest as a promise. */
function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb() {
  if (disabled) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    // Accessing or opening IndexedDB throws outright on an opaque origin,
    // which is what `file://` gives us.
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));

    // An open can also hang silently — behind a delete still queued from
    // another tab, for instance — firing none of the three events above.
    // Giving up is right either way: the workbench itself does not need
    // storage, so a stuck database must never leave a save pending forever.
    setTimeout(() => reject(new Error('IndexedDB did not open')), OPEN_TIMEOUT);
  }).catch(() => {
    disabled = true;
    return null;
  });

  return dbPromise;
}

/** True once storage has been found unusable, so callers can explain why. */
export const storageDisabled = () => disabled;

/**
 * Allows session writes to begin. Called once startup has either restored the
 * stored session or established that it is not wanted.
 */
export const armPersistence = () => { armed = true; };

/**
 * Stores the bytes of one source file. Source bytes are immutable, so this is
 * a no-op when the id is already present.
 *
 * @param {string} srcId
 * @param {string} name
 * @param {Uint8Array} bytes
 */
export async function putSource(srcId, name, bytes) {
  // Adding a file starts a new session, which settles the question of what to
  // do with any old one: the next save prunes whatever it no longer refers to.
  armed = true;

  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction(SOURCES, 'readwrite');
    const store = tx.objectStore(SOURCES);
    const existing = await wrap(store.getKey(srcId));
    if (existing === undefined) store.put({ name, bytes }, srcId);
    await done(tx);
  } catch {
    // Almost always a quota rejection on a very large file. The session simply
    // will not be restorable; the app itself carries on unaffected.
    disabled = true;
  }
}

/**
 * Writes the page list and drops any source file no page refers to any more.
 * Call through `saveSessionSoon` rather than directly.
 *
 * @param {object[]} pages  live page records
 */
async function saveSession(pages) {
  const db = await openDb();
  if (!db) return;

  const slim = pages.map((p) => ({
    id: p.id,
    type: p.type,
    srcId: p.srcId,
    srcName: p.srcName,
    pageIndex: p.pageIndex,
    mime: p.mime,
    rotation: p.rotation,
  }));

  try {
    const tx = db.transaction([META, SOURCES], 'readwrite');
    tx.objectStore(META).put({ pages: slim, savedAt: Date.now() }, SESSION_KEY);

    const live = new Set(slim.map((p) => p.srcId));
    const sources = tx.objectStore(SOURCES);
    for (const key of await wrap(sources.getAllKeys())) {
      if (!live.has(key)) sources.delete(key);
    }

    await done(tx);
  } catch {
    disabled = true;
  }
}

/** Debounced `saveSession`, so a drag across ten tiles writes once. */
export function saveSessionSoon(pages) {
  if (disabled || !armed) return;
  clearTimeout(saveTimer);
  // The list is copied now: the caller keeps mutating the live array.
  const snapshot = pages.slice();
  saveTimer = setTimeout(() => saveSession(snapshot), SAVE_DELAY);
}

/**
 * Reads back the stored session.
 *
 * Pages that came from the same file are given the *same* `bytes` reference,
 * preserving the invariant the PDF exporter and the pdf.js cache rely on.
 *
 * @returns {Promise<{pages: object[], savedAt: number} | null>}
 */
export async function readSession() {
  const db = await openDb();
  if (!db) return null;

  try {
    const tx = db.transaction([META, SOURCES], 'readonly');
    const meta = await wrap(tx.objectStore(META).get(SESSION_KEY));
    if (!meta || !meta.pages || !meta.pages.length) return null;

    const sources = tx.objectStore(SOURCES);
    const bytesById = new Map();
    for (const srcId of new Set(meta.pages.map((p) => p.srcId))) {
      const rec = await wrap(sources.get(srcId));
      if (rec) bytesById.set(srcId, new Uint8Array(rec.bytes));
    }

    // A page whose source went missing (a half-finished quota-limited write)
    // is dropped rather than restored as a broken tile.
    const pages = meta.pages
      .filter((p) => bytesById.has(p.srcId))
      .map((p) => ({ ...p, bytes: bytesById.get(p.srcId), selected: false }));

    return pages.length ? { pages, savedAt: meta.savedAt } : null;
  } catch {
    disabled = true;
    return null;
  }
}

/** Throws the stored session away. */
export async function clearSession() {
  clearTimeout(saveTimer);
  const db = await openDb();
  if (!db) return;

  try {
    const tx = db.transaction([META, SOURCES], 'readwrite');
    tx.objectStore(META).delete(SESSION_KEY);
    tx.objectStore(SOURCES).clear();
    await done(tx);
  } catch {
    disabled = true;
  }
}
