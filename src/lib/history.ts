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

const KEY = "lume:history:v1";

export function getHistory(): Valuation[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem(KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Error al leer historial", e);
    return [];
  }
}

export function saveValuation(v: Valuation) {
  if (typeof window === "undefined") return;
  try {
    const history = getHistory();
    
    // Evitar duplicados por ID
    const filtered = history.filter((item) => item.id !== v.id);
    
    // Añadir al principio de la lista
    filtered.unshift(v);

    // Mantener un máximo de 30 elementos para no llenar la memoria del móvil
    const trimmed = filtered.slice(0, 30);

    localStorage.setItem(KEY, JSON.stringify(trimmed));
    console.log("¡Tasación guardada con éxito!", v);
  } catch (e) {
    console.error("Error al guardar en localStorage (posiblemente cuota llena):", e);
    
    // Si falla por peso de la imagen, intentamos guardar comprimiendo/omitiendo la miniatura
    try {
      const history = getHistory();
      const vLight = { ...v, thumbnail: "" }; // Quitar foto si la memoria del teléfono se llena
      history.unshift(vLight);
      localStorage.setItem(KEY, JSON.stringify(history.slice(0, 20)));
    } catch (err) {
      console.error("No se pudo guardar ni en versión ligera", err);
    }
  }
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.error("Error al borrar historial", e);
  }
}

