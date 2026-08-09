export interface StoredImage {
  id: string;
  dataUrl: string;
  base64: string;
  zoom: number;
  isMacro: boolean;
  timestamp: string;
}

export interface ReasoningStep {
  step: number;
  title: string;
  description: string;
}

export interface ValuationRecord {
  id: string;
  createdAt: string;
  assetType: string;
  location: string;
  usefulArea: number;
  exactPricePerM2: number;
  totalValuation: number;
  confidenceScore: number;
  reasoningSteps: ReasoningStep[];
  images: StoredImage[];
}

const DB_NAME = "LumeValuationDB";
const DB_VERSION = 1;
const STORE_VALUATIONS = "valuations";

export function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      console.warn("IndexedDB no está disponible en este entorno.");
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_VALUATIONS)) {
        db.createObjectStore(STORE_VALUATIONS, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error("Error al abrir IndexedDB:", request.error);
      resolve(null);
    };
  });
}

export async function saveValuationRecord(
  record: ValuationRecord
): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_VALUATIONS, "readwrite");
    const store = tx.objectStore(STORE_VALUATIONS);
    const req = store.put(record);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAllValuations(): Promise<ValuationRecord[]> {
  const db = await openDB();
  if (!db) return [];

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_VALUATIONS, "readonly");
    const store = tx.objectStore(STORE_VALUATIONS);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}
