/**
 * Attachment binary store — IndexedDB.
 *
 * The app's structured data (Species / Invoice / InvoiceItem) still lives
 * in LocalStorage. Binary blobs (거래명세서 원본 이미지 · PDF) are far too
 * large for LocalStorage's 5 MB quota, so we push those into IndexedDB
 * and keep only their metadata on the Invoice record.
 *
 *   DB name     :  species-catalog
 *   Object store:  attachments  (keyPath: "id")
 *
 * Each stored record shape:
 *   {
 *     id,          "att-<hex>"
 *     invoiceId,   "inv-###"           — attribution back to the Invoice
 *     filename,    "invoice.png"
 *     mimeType,    "image/png"
 *     size,        Number (bytes)
 *     blob,        Blob               — the actual binary
 *     createdAt    ISO-8601
 *   }
 *
 * The `putAttachment()` return value strips the blob and adds
 * `storagePath` (opaque descriptor) + `thumbnailPath` (empty for now) so
 * that Invoice.attachment stays a small JSON-serializable metadata blob
 * suitable for LocalStorage.
 */

const DB_NAME    = "species-catalog";
const DB_VERSION = 1;
const STORE      = "attachments";

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("이 브라우저는 IndexedDB 를 지원하지 않습니다."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("invoiceId", "invoiceId", { unique: false });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
  return dbPromise;
}

/**
 * Called once at startup — pre-opens the DB and creates the object store
 * if this is a first visit. Failures are non-fatal (caller should still
 * let the app run; attachments will simply be unavailable).
 */
export async function initAttachmentStore() {
  try { await openDB(); return true; }
  catch (err) { console.warn("[attachmentStore] init failed:", err); return false; }
}

// ============================================================
// CRUD
// ============================================================

/**
 * Persist a file as an attachment for a given invoice.
 * Returns JSON-serializable metadata to be assigned to `Invoice.attachment`.
 * The full Blob stays inside IndexedDB and is fetched on demand by
 * `getAttachment()`.
 *
 * @param {{ invoiceId: string, file: File | Blob }} opts
 * @returns {Promise<{
 *   id: string,
 *   filename: string,
 *   mimeType: string,
 *   size: number,
 *   createdAt: string,
 *   storagePath: string,
 *   thumbnailPath: string,
 *   status: string
 * }>}
 */
export async function putAttachment({ invoiceId, file }) {
  const db = await openDB();
  const id  = generateId();
  const now = new Date().toISOString();
  const filename = file?.name || "attachment.bin";
  const mimeType = file?.type || "application/octet-stream";
  const size     = Number(file?.size) || 0;

  await runTx(db, "readwrite", store => store.put({
    id, invoiceId, filename, mimeType, size,
    blob:      file,
    createdAt: now
  }));

  return {
    id,
    filename,
    mimeType,
    size,
    createdAt:      now,
    storagePath:    `indexeddb:${DB_NAME}/${STORE}/${id}`,
    thumbnailPath:  "",
    status:         "stored"
  };
}

/**
 * Fetch an attachment. Returns `null` if not found (e.g. IndexedDB cleared).
 * @param {string} id
 * @returns {Promise<{ id, invoiceId, filename, mimeType, size, blob, createdAt } | null>}
 */
export async function getAttachment(id) {
  if (!id) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Delete an attachment. Missing-id is a no-op.
 * @param {string} id
 */
export async function deleteAttachment(id) {
  if (!id) return;
  const db = await openDB();
  await runTx(db, "readwrite", store => store.delete(id));
}

/**
 * Delete every attachment tied to an invoice (cascade from Invoice delete).
 * @param {string} invoiceId
 */
export async function deleteAttachmentsForInvoice(invoiceId) {
  if (!invoiceId) return;
  const db = await openDB();
  await runTx(db, "readwrite", store => {
    const idx = store.index("invoiceId");
    const req = idx.openCursor(IDBKeyRange.only(invoiceId));
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    return req;
  });
}

/**
 * List all attachment metadata (no blobs). Useful for debugging.
 * @returns {Promise<Array<{ id, invoiceId, filename, mimeType, size, createdAt }>>}
 */
export async function listAttachments() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).openCursor();
    const out = [];
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) {
        const { id, invoiceId, filename, mimeType, size, createdAt } = cursor.value;
        out.push({ id, invoiceId, filename, mimeType, size, createdAt });
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

// ============================================================
// Internals
// ============================================================

function runTx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let out;
    try { out = fn(store); }
    catch (err) { reject(err); return; }
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

function generateId() {
  // Prefer crypto.randomUUID; fall back to a hex random for old runtimes.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return "att-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  return "att-" + Math.random().toString(16).slice(2, 14);
}
