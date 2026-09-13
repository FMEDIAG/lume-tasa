export type CoinMetal =
  | "gold"
  | "silver"
  | "platinum"
  | "copper"
  | "bimetallic"
  | "paper"
  | "unknown";

export type CoinCertifier = "NGC" | "PCGS" | "ANACS" | "ICG" | "none" | "unknown";

export type CoinMarketType = "bullion" | "numismatic" | "unknown";

export type CoinId = {
  title: string;
  country: string;
  denomination: string;
  year: string;
  mint: string;
  seriesName: string;
  metal: CoinMetal;
  estimatedFineWeightG?: number | null;
  certifier: CoinCertifier;
  grade?: string | null;
  certNumber?: string | null;
  isLikelyReproduction?: boolean;
  marketType?: CoinMarketType;
  identification: string;
  searchQuery: string;
  confidence: "low" | "medium" | "high";
};

export type MoneyRange = {
  priceEurMin: number;
  priceEurMax: number;
  priceUsdMin: number;
  priceUsdMax: number;
  notes: string;
};

export type MetalSpots = {
  goldUsd: number;
  silverUsd: number;
  goldEur: number;
  silverEur: number;
  eurPerUsd: number;
};

const TROY_OZ_G = 31.1034768;

export type GradeBand = "ms" | "au" | "xf" | "circ" | "unknown";

export function blobOf(id: CoinId): string {
  return `${id.title} ${id.denomination} ${id.seriesName} ${id.identification} ${id.searchQuery} ${id.country}`.toLowerCase();
}

export function isSlabbed(certifier: CoinCertifier): boolean {
  return certifier === "NGC" || certifier === "PCGS" || certifier === "ANACS" || certifier === "ICG";
}

export function gradeBand(grade: string | null | undefined): GradeBand {
  const g = (grade ?? "").toUpperCase();
  if (!g.trim()) return "unknown";
  if (/(^|[^A-Z])(MS|PR|PF|PL|SP|DCAM|CAM)([- ]?\d|$)/.test(g) || /MINT STATE|PROOF/.test(g)) {
    return "ms";
  }
  if (/\bAU([- ]?\d)?\b/.test(g) || /ABOUT UNC|CASI SC/.test(g)) return "au";
  if (/\b(XF|EF|EXTREMELY FINE|EBC)\b/.test(g)) return "xf";
  return "circ";
}

const BULLION_RE =
  /krugerrand|maple leaf|american (silver |gold )?eagle|britannia|philharmonic|kangaroo|nugget|gold buffalo|chinese panda|perth mint|1\s*oz (gold|silver)|libertads?\b/;

export function isModernBullion(id: CoinId): boolean {
  if (id.marketType === "bullion") return true;
  if (id.marketType === "numismatic") return false;
  const blob = blobOf(id);
  if (BULLION_RE.test(blob)) return true;
  // Common 50 pesos / Centenario bullion restrikes — not colonial gold.
  if (/50\s*pesos|centenario/.test(blob) && !/escudo/.test(blob)) return true;
  return false;
}

/**
 * Fine-metal grams when the model omits weight. Conservative catalogue figures.
 */
export function typicalFineWeightG(id: CoinId): number | null {
  if (id.estimatedFineWeightG && id.estimatedFineWeightG > 0) return id.estimatedFineWeightG;
  const blob = blobOf(id);
  const table: Array<{ re: RegExp; g: number }> = [
    { re: /8\s*escudos|ocho escudos|\bonza\b|doubloon/, g: 23.68 },
    { re: /4\s*escudos|cuatro escudos/, g: 11.84 },
    { re: /2\s*escudos|dos escudos/, g: 5.92 },
    { re: /1\s*escudo|un escudo/, g: 2.96 },
    { re: /100\s*pesetas/, g: 29.03 },
    { re: /25\s*pesetas/, g: 7.26 },
    { re: /10\s*escudos/, g: 7.56 },
    { re: /80\s*reales/, g: 6.77 },
    { re: /4\s*excelentes|doble excelente/, g: 14.0 },
    { re: /double eagle|saint[-\s]?gaudens|\$20\b|20 dollars/, g: 30.09 },
    { re: /\$10\b|eagle.*indian|indian (head )?eagle/, g: 15.05 },
  ];
  for (const row of table) {
    if (row.re.test(blob)) return row.g;
  }
  return null;
}

export function meltValue(id: CoinId, spots: MetalSpots | null): { eur: number; usd: number } | null {
  if (!spots || id.isLikelyReproduction) return null;
  const grams = typicalFineWeightG(id);
  if (grams == null || grams <= 0) return null;
  const oz = grams / TROY_OZ_G;
  if (id.metal === "gold") return { eur: oz * spots.goldEur, usd: oz * spots.goldUsd };
  if (id.metal === "silver") return { eur: oz * spots.silverEur, usd: oz * spots.silverUsd };
  return null;
}

type FloorRule = { re: RegExp; circ: number; xf: number; au: number; ms: number };

const COLLECTOR_FLOORS_EUR: FloorRule[] = [
  // Spanish / colonial gold — the ~€10k undervaluation class.
  { re: /8\s*escudos|ocho escudos|\bonza\b|doubloon/, circ: 6500, xf: 9500, au: 12500, ms: 18000 },
  { re: /4\s*escudos|cuatro escudos/, circ: 2200, xf: 3500, au: 5000, ms: 8000 },
  { re: /2\s*escudos|dos escudos/, circ: 900, xf: 1400, au: 2200, ms: 3500 },
  { re: /4\s*excelentes|doble excelente|reyes cat[oó]licos/, circ: 7000, xf: 11000, au: 15000, ms: 22000 },
  { re: /100\s*pesetas/, circ: 3500, xf: 5500, au: 8000, ms: 14000 },
  { re: /25\s*pesetas/, circ: 800, xf: 1200, au: 1800, ms: 3000 },
  { re: /\bcob\b|macuquina/, circ: 1200, xf: 2500, au: 4500, ms: 8000 },
  { re: /10\s*escudos/, circ: 1800, xf: 2800, au: 4000, ms: 6500 },
  { re: /80\s*reales/, circ: 700, xf: 1100, au: 1600, ms: 2800 },
];

function pickFloor(rule: FloorRule, band: GradeBand): number {
  if (band === "ms") return rule.ms;
  if (band === "au") return rule.au;
  if (band === "xf") return rule.xf;
  if (band === "circ") return rule.circ;
  // Unknown grade: use XF — typical well-photographed piece, not a wreck.
  return rule.xf;
}

/**
 * Absolute EUR collector floors. Not an estimate: only lifts an implausibly low
 * melt-style quote. Returns null for bullion / reproductions / low confidence.
 */
export function collectorFloorEur(id: CoinId): number | null {
  if (id.isLikelyReproduction || id.confidence === "low") return null;
  if (isModernBullion(id)) return null;
  const blob = blobOf(id);
  const band = gradeBand(id.grade);
  const slabBonus = isSlabbed(id.certifier) && (band === "ms" || band === "au") ? 1.08 : 1;
  for (const rule of COLLECTOR_FLOORS_EUR) {
    if (!rule.re.test(blob)) continue;
    return Math.round(pickFloor(rule, band) * slabBonus);
  }
  return null;
}

/**
 * Extra lift vs melt for historical gold the model still prices as bullion.
 * 8 escudos melt is ~€2.5k; 4–5× recovers the typical €10k miss.
 */
export function numismaticMeltMultiplier(id: CoinId): number {
  if (id.isLikelyReproduction || id.confidence === "low") return 1;
  if (isModernBullion(id)) return 1.02;
  const blob = blobOf(id);
  const band = gradeBand(id.grade);
  const byBand = (circ: number, xf: number, au: number, ms: number) => {
    if (band === "ms") return ms;
    if (band === "au") return au;
    if (band === "xf") return xf;
    if (band === "circ") return circ;
    return xf;
  };
  if (/8\s*escudos|ocho escudos|\bonza\b|doubloon/.test(blob)) return byBand(2.8, 4.2, 5.2, 7);
  if (/4\s*escudos|cuatro escudos/.test(blob)) return byBand(2.2, 3.2, 4.2, 5.5);
  if (/4\s*excelentes|doble excelente|reyes cat[oó]licos/.test(blob)) return byBand(3, 4.5, 6, 8);
  if (/100\s*pesetas/.test(blob)) return byBand(1.6, 2.4, 3.2, 5);
  if (/\bcob\b|macuquina/.test(blob)) return byBand(2, 3, 4.5, 6);
  if (id.metal === "gold" && id.marketType !== "bullion") return byBand(1.15, 1.4, 1.7, 2.2);
  return 1;
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n < 1) return Math.round(n * 100) / 100;
  if (n < 100) return Math.round(n * 10) / 10;
  return Math.round(n);
}

function liftMin(
  result: MoneyRange,
  eurMin: number,
  usdMin: number,
  note: string,
): MoneyRange {
  let { priceEurMin, priceEurMax, priceUsdMin, priceUsdMax, notes } = result;
  let applied = false;
  if (eurMin > 0 && priceEurMin < eurMin) {
    priceEurMin = roundMoney(eurMin);
    priceEurMax = Math.max(priceEurMax, roundMoney(eurMin * 1.25));
    applied = true;
  }
  if (usdMin > 0 && priceUsdMin < usdMin) {
    priceUsdMin = roundMoney(usdMin);
    priceUsdMax = Math.max(priceUsdMax, roundMoney(usdMin * 1.25));
    applied = true;
  }
  if (priceEurMax < priceEurMin) priceEurMax = priceEurMin;
  if (priceUsdMax < priceUsdMin) priceUsdMax = priceUsdMin;
  if (applied && note && !notes.includes(note.slice(0, 40))) {
    notes = `${notes}\n${note}`.slice(0, 4000);
  }
  return { priceEurMin, priceEurMax, priceUsdMin, priceUsdMax, notes };
}

/**
 * Apply melt floor + collector floor + numismatic multiplier.
 * Mutates nothing; returns a new range.
 */
export function applyCoinPriceGuards(
  result: MoneyRange,
  id: CoinId,
  spots: MetalSpots | null,
): MoneyRange {
  let next = { ...result };
  const melt = meltValue(id, spots);
  const fx = spots?.eurPerUsd || 0.86;

  const floorEur = collectorFloorEur(id);
  if (floorEur && floorEur > 0) {
    next = liftMin(
      next,
      floorEur,
      Math.round(floorEur / fx),
      `Suelo de mercado coleccionista aplicado (${floorEur} €): la fundición no es el precio de esta pieza.`,
    );
  }

  const mult = numismaticMeltMultiplier(id);
  if (melt && mult > 1.05) {
    const targetEur = melt.eur * mult;
    const targetUsd = melt.usd * mult;
    next = liftMin(
      next,
      targetEur,
      targetUsd,
      `Prima numismática mínima ×${mult.toFixed(1)} sobre fundición (${roundMoney(melt.eur)} €).`,
    );
  }

  if (melt && id.confidence !== "low") {
    next = liftMin(next, melt.eur * 0.95, melt.usd * 0.95, "");
  }

  return next;
}
