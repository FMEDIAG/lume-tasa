import { z } from "zod";

const valuationSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(500),
  thumbnail: z.string().url().max(2048).optional().or(z.literal("")),
  createdAt: z.union([z.string(), z.number()]),
  priceEurMin: z.number().finite(),
  priceEurMax: z.number().finite(),
  priceUsdMin: z.number().finite(),
  priceUsdMax: z.number().finite(),
  identification: z.string().max(10_000),
  confidence: z.string(),
  category: z.string().optional(),
  notes: z.string().max(50_000).optional(),
  sources: z.array(z.string().max(200)).max(50).optional(),
});

export async function importHistory(json: string): Promise<number> {
  const parsed = valuationSchema.array().safeParse(JSON.parse(json));
  if (!parsed.success) throw new Error("Archivo de historial inválido");
  // ... guardar parsed.data
}

const LEGACY_KEY = "lume:history:v1";
const DB_NAME = "LumeDB";
const STORE = "history";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

function notify() {
  window.dispatchEvent(new Event("lume:history"));
}

let migrated = false;

async function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const items: Valuation[] = JSON.parse(raw);
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item && item.id) await tx("readwrite", (s) => s.put(item));
      }
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) {
    console.error("Error migrando historial antiguo", e);
  }
}

export async function getHistory(): Promise<Valuation[]> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return [];
  try {
    await migrateLegacy();
    const items = await tx<Valuation[]>("readonly", (s) => s.getAll() as IDBRequest<Valuation[]>);
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.error("Error al leer historial", e);
    return [];
  }
}

export async function saveValuation(v: Valuation): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  await migrateLegacy();
  await tx("readwrite", (s) => s.put(v));
  notify();
}

export const saveHistory = saveValuation;

export async function deleteValuation(id: string): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  try {
    await tx("readwrite", (s) => s.delete(id));
    notify();
  } catch (e) {
    console.error("Error al borrar tasación", e);
  }
}

export const deleteHistory = deleteValuation;

export async function exportHistory(): Promise<void> {
  const items = await getHistory();
  const payload = {
    app: "Lume",
    kind: "valuation-history",
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lume-historial-${new Date().toISOString().slice(0, 5)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function isValuation(v: unknown): v is Valuation {
  const o = v as Valuation;
  return (
    !!o &&
    typeof o === "object" &&
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.createdAt === "number" &&
    typeof o.priceEurMin === "number" &&
    typeof o.priceEurMax === "number"
  );
}

/** Importa un JSON exportado. Devuelve el número de tasaciones añadidas/actualizadas. */
export async function importHistory(json: string): Promise<number> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return 0;
  const parsed: unknown = JSON.parse(json);
  const raw = Array.isArray(parsed)
    ? parsed
    : ((parsed as { items?: unknown[] })?.items ?? null);
  if (!Array.isArray(raw)) throw new Error("Formato de archivo no válido");
  const items = raw.filter(isValuation);
  if (items.length === 0) throw new Error("El archivo no contiene tasaciones válidas");
  await migrateLegacy();
  for (const item of items) {
    await tx("readwrite", (s) => s.put(item));
  }
  notify();
  return items.length;
}

export async function clearHistory(): Promise<void> {
  if (typeof window === "undefined" || !("indexedDB" in window)) return;
  try {
    await tx("readwrite", (s) => s.clear());
    localStorage.removeItem(LEGACY_KEY);
    notify();
  } catch (e) {
    console.error("Error al borrar historial", e);
  }
}
