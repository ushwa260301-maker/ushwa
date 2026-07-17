/**
 * Persistence layer — three separate localStorage collections + a small
 * meta blob for categories/colors.
 *
 * Keys under `species-catalog:v2:*`:
 *   species          Array<Species>
 *   invoices         Array<Invoice>
 *   invoiceItems     Array<InvoiceItem>
 *   meta             { categories, colors }
 *
 * `load()` returns them unified as `{ categories, colors, species, invoices, invoiceItems }`
 * so the rest of the app sees one object.
 *
 * A v1 blob at `species-catalog:v1` (the pre-refactor single key with
 * species.prices / species.purchaseCounts) is auto-migrated on first
 * load and then removed.
 */

const V2 = {
  species: "species-catalog:v2:species",
  invoices: "species-catalog:v2:invoices",
  invoiceItems: "species-catalog:v2:invoiceItems",
  meta: "species-catalog:v2:meta"
};
const V1_KEY = "species-catalog:v1";

export const storage = {
  /**
   * Persist a full catalog snapshot into the 3 collection keys + meta.
   * @param {{categories:string[], colors:string[], species:object[], invoices:object[], invoiceItems:object[]}} data
   */
  save(data) {
    try {
      localStorage.setItem(V2.species, JSON.stringify(data.species || []));
      localStorage.setItem(V2.invoices, JSON.stringify(data.invoices || []));
      localStorage.setItem(V2.invoiceItems, JSON.stringify(data.invoiceItems || []));
      localStorage.setItem(V2.meta, JSON.stringify({
        categories: data.categories || [],
        colors: data.colors || []
      }));
      return true;
    } catch (err) {
      console.error("[storage] save failed:", err);
      return false;
    }
  },

  /**
   * Load a previously-saved catalog, migrating v1 → v2 in the process.
   * @returns {object|null}
   */
  load() {
    // Try v2 first
    const v2 = readV2();
    if (v2) return v2;

    // Fall back: migrate a v1 blob if present
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.species)) return null;
      const migrated = migrateFromV1(parsed);
      this.save(migrated);
      localStorage.removeItem(V1_KEY);
      return migrated;
    } catch {
      return null;
    }
  },

  /**
   * Wipe every stored key (used by "시드 복원").
   */
  clear() {
    Object.values(V2).forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(V1_KEY);
  }
};

// ============================================================
// Internal helpers
// ============================================================

function readV2() {
  try {
    const species = JSON.parse(localStorage.getItem(V2.species) || "null");
    const invoices = JSON.parse(localStorage.getItem(V2.invoices) || "null");
    const invoiceItems = JSON.parse(localStorage.getItem(V2.invoiceItems) || "null");
    const meta = JSON.parse(localStorage.getItem(V2.meta) || "null");
    if (!Array.isArray(species) || !Array.isArray(invoices) || !Array.isArray(invoiceItems)) return null;
    return {
      categories: meta?.categories || [],
      colors: meta?.colors || [],
      species,
      invoices,
      invoiceItems
    };
  } catch {
    return null;
  }
}

/**
 * Convert a v1 catalog (species with embedded prices + purchaseCounts) into
 * a v2 catalog by synthesizing Invoice / InvoiceItem records. Deterministic:
 * given the same v1 input the migration always produces the same v2 output.
 */
function migrateFromV1(v1) {
  const species = [];
  const invoices = [];
  const invoiceItems = [];
  let invCounter = 0;
  let itemCounter = 0;
  const pad3 = n => String(n).padStart(3, "0");
  const invByKey = new Map();

  for (const sp of v1.species) {
    species.push({
      id: sp.id,
      name: sp.name,
      latin: sp.scientificName || sp.latin || "",
      category: sp.category,
      bloomMonths: sp.bloomMonths || [],
      colors: sp.colors || [],
      suppliers: sp.suppliers || [],
      notes: sp.notes || ""
    });

    const counts = sp.purchaseCounts || [];
    const prices = sp.prices || [];
    const suppliers = sp.suppliers?.length ? sp.suppliers : [{ name: "미지정", region: "", contact: "" }];
    const total = counts.reduce((a, b) => a + (Number(b) || 0), 0);

    if (total > 0 && prices.length) {
      // Distribute purchases across months × suppliers, cycling through price rows.
      for (let m = 1; m <= 12; m++) {
        const cnt = Number(counts[m - 1]) || 0;
        for (let i = 0; i < cnt; i++) {
          const supplier = suppliers[i % suppliers.length];
          const spec = prices[i % prices.length];
          const key = `${sp.id}|${supplier.name}|${m}`;
          let inv = invByKey.get(key);
          if (!inv) {
            invCounter += 1;
            const day = 4 + (i % 24);
            const dateStr = `2025-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            inv = {
              id: `inv-${pad3(invCounter)}`,
              invoiceDate: dateStr,
              supplier: supplier.name,
              supplierAddress: supplier.region || "",
              supplierPhone: supplier.contact || "",
              invoiceNumber: `S25-${String(invCounter).padStart(4, "0")}`,
              createdAt: `${dateStr}T09:00:00Z`
            };
            invoices.push(inv);
            invByKey.set(key, inv);
          }
          itemCounter += 1;
          invoiceItems.push({
            id: `item-${pad3(itemCounter)}`,
            invoiceId: inv.id,
            speciesId: sp.id,
            speciesName: sp.name,
            spec: spec.spec,
            unit: spec.unit || "주",
            quantity: 1,
            unitPrice: spec.price,
            amount: spec.price
          });
        }
      }
    } else if (prices.length) {
      // No purchases but the species has price rows → create a catalog invoice.
      invCounter += 1;
      const supplier = suppliers[0];
      const inv = {
        id: `inv-${pad3(invCounter)}`,
        invoiceDate: "2025-01-01",
        supplier: supplier.name,
        supplierAddress: supplier.region || "",
        supplierPhone: supplier.contact || "",
        invoiceNumber: `C-${sp.id}`,
        createdAt: "2025-01-01T09:00:00Z"
      };
      invoices.push(inv);
      for (const p of prices) {
        itemCounter += 1;
        invoiceItems.push({
          id: `item-${pad3(itemCounter)}`,
          invoiceId: inv.id,
          speciesId: sp.id,
          speciesName: sp.name,
          spec: p.spec,
          unit: p.unit || "주",
          quantity: 1,
          unitPrice: p.price,
          amount: p.price
        });
      }
    }
  }

  return {
    categories: v1.categories || [],
    colors: v1.colors || [],
    species,
    invoices,
    invoiceItems
  };
}
