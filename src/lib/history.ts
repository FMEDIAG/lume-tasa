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

function persist(items: Valuation[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("lume:history"));
}

export function saveValuation(v: Valuation) {
  if (typeof window === "undefined") return;
  const history = getHistory().filter((item) => item.id !== v.id);
  history.unshift(v);

  try {
    persist(history.slice(0, 30));
  } catch (e) {
    console.error("Error al guardar en localStorage (posiblemente cuota llena):", e);
    // Si falla por peso de las imágenes, guardamos sin miniaturas antiguas
    try {
      const light = history.slice(0, 20).map((item, i) =>
        i === 0 ? item : { ...item, thumbnail: "" }
      );
      persist(light);
    } catch {
      try {
        persist(history.slice(0, 20).map((item) => ({ ...item, thumbnail: "" })));
      } catch (err) {
        console.error("No se pudo guardar ni en versión ligera", err);
      }
    }
  }
}

export function deleteValuation(id: string) {
  if (typeof window === "undefined") return;
  try {
    persist(getHistory().filter((item) => item.id !== id));
  } catch (e) {
    console.error("Error al borrar tasación", e);
  }
}

export function clearHistory() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("lume:history"));
  } catch (e) {
    console.error("Error al borrar historial", e);
  }
}

