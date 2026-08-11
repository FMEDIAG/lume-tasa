export interface StoredImage {
  id: string;
  dataUrl: string;
  base64?: string;
  zoom?: number;
  isMacro?: boolean;
  timestamp?: string;
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
  reasoningSteps: Array<{
    step: number;
    title: string;
    description: string;
  }>;
  images: StoredImage[];
}

const DB_NAME = "LumeValuationsDB";
const STORE_NAME = "valuations";

const initDB = (): Promise<IDBDatabase | null> => {
  return new Promise((resolve, reject) => {
    // Protección contra ejecución en Servidor (SSR)
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
};

export const saveValuationRecord = async (record: ValuationRecord): Promise<void> => {
  const db = await initDB();
  if (!db) return; // Si estamos en SSR, ignoramos la llamada en servidor

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllValuations = async (): Promise<ValuationRecord[]> => {
  const db = await initDB();
  if (!db) return []; // Si estamos en SSR, devolvemos lista vacía en servidor

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};
