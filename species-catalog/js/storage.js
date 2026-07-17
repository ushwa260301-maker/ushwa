/**
 * Persistence layer. Today: browser localStorage. Tomorrow (planned):
 * IndexedDB / REST API / user-account backend — swap the implementation
 * here without touching any consumer.
 *
 * The public surface (`storage.load / save / clear`) is deliberately small
 * so the swap stays trivial.
 */

const STORAGE_KEY = "species-catalog:v1";

export const storage = {
  /**
   * Persist the full catalog snapshot.
   * @param {{categories:string[], colors:string[], species:object[]}} data
   * @returns {boolean} whether the write succeeded (quota errors etc. return false)
   */
  save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      console.error("[storage] save failed:", err);
      return false;
    }
  },

  /**
   * Load a previously-saved catalog snapshot.
   * @returns {object|null} data object, or null if nothing valid is stored.
   */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.species)) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  /** Wipe stored data (used by "시드 복원"). */
  clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
};
