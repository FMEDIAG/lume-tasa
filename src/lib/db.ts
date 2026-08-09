// Tipos de datos para las imágenes dentro de LumeDB
export interface StoredImage {
  id?: number;              // ID autogenerado por IndexedDB
  valuationId?: string;     // ID de la tasación (opcional si es un borrador)
  dataUrl: string;          // Imagen codificada en Base64 / DataURL
  isMacro: boolean;         // Bandera que indica si fue tomada en modo Macro
  zoom: number;             // Nivel de zoom aplicado (1x, 2x, 3x, 5x)
  createdAt: string;        // Fecha de captura en formato ISO
}

// Estructura general de una tasación en el historial
export interface ValuationRecord {
  id: string;
  createdAt: string;
  assetType: string;
  location: string;
  usefulArea: number;
  exactPricePerM2: number;  // Regla estricta: NO REDONDEAR
  totalValuation: number;
  confidenceScore: number;
  reasoningSteps: {
    step: number;
    title: string;
    description: string;
  }[];
  images: StoredImage[];
}

const DB_NAME = "LumeDB";
const DB_VERSION = 1;
const IMAGE_STORE = "images";
const HISTORY_STORE = "history";

/**
 * Abre la conexión con la base de datos IndexedDB LumeDB
 */
export function openLumeDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Almacén para imágenes individuales con clave autoincremental
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        const imageStore = db.createObjectStore(IMAGE_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        imageStore.createIndex("valuationId", "valuationId", { unique: false });
      }

      // Almacén para el historial completo de tasaciones
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Guarda una captura individual con metadatos Macro y Zoom en IndexedDB
 */
export async function saveValuationImage(
  imageData: Omit<StoredImage, "id">
): Promise<number> {
  const db = await openLumeDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE, "readwrite");
    const store = transaction.objectStore(IMAGE_STORE);
    const request = store.add(imageData);

    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Recupera todas las imágenes asociadas a una tasación específica
 */
export async function getValuationImages(
  valuationId: string
): Promise<StoredImage[]> {
  const db = await openLumeDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE, "readonly");
    const store = transaction.objectStore(IMAGE_STORE);
    const index = store.index("valuationId");
    const request = index.getAll(valuationId);

    request.onsuccess = () => resolve(request.result as StoredImage[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Guarda o actualiza una tasación completa en el historial
 */
export async function saveValuationRecord(
  record: ValuationRecord
): Promise<void> {
  const db = await openLumeDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, "readwrite");
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Obtiene todo el historial de tasaciones guardadas
 */
export async function getAllValuations(): Promise<ValuationRecord[]> {
  const db = await openLumeDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(HISTORY_STORE, "readonly");
    const store = transaction.objectStore(HISTORY_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as ValuationRecord[]);
    request.onerror = () => reject(request.error);
  });
}
