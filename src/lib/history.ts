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
  thumbnail: string; // data URL of first photo
  category?: string;
}

const KEY = "lume:history:v1";

export function getHistory(): Valuation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveValuation(v: Valuation) {
  const list = [v, ...getHistory()].slice(0, 100);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("lume:history"));
}

export function deleteValuation(id: string) {
  const list = getHistory().filter((v) => v.id !== id);
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("lume:history"));
}
