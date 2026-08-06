export interface Valuation {
  id: string;
  createdAt: number;
  title: string;
  identification: string;
  priceEurMin: number;
  priceEurMax: number;
  priceUsdMin: number;
  priceUsdMax: number;
  confidence: "low" | "medium" | "high";
  notes: string;
  sources: string[];
  thumbnail: string;
  category?: string;
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
