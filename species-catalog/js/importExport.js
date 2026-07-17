/**
 * Seed loading + JSON import/export. Separate from storage.js so the
 * transport (fetch / File API / API endpoint) can evolve independently
 * of the persistence layer.
 */

const SEED_URL = "data/species.json";

/**
 * Fetch the initial seed catalog shipped with the app.
 * @returns {Promise<object>}
 */
export async function loadSeed() {
  const res = await fetch(SEED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Seed fetch failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Trigger a browser download of the current data as pretty-printed JSON.
 * @param {object} data
 * @param {string} [filename]
 */
export function exportJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `species-catalog-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Read + validate a user-uploaded JSON file.
 * @param {File} file
 * @returns {Promise<{categories:string[], colors:string[], species:object[]}>}
 */
export function importJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || !Array.isArray(parsed.species)) {
          throw new Error("올바른 형식이 아닙니다 (species 배열 없음)");
        }
        resolve({
          categories: parsed.categories || [],
          colors: parsed.colors || [],
          species: parsed.species
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsText(file);
  });
}
