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

export type GoldForm = "solid" | "plated" | "gilt" | "unknown";

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
  goldForm?: GoldForm;
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
  return `${id.title} ${id.denomination} ${id.seriesName} ${id.identification} ${id.searchQuery} ${id.country} ${id.goldForm ?? ""}`.toLowerCase();
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

const PLATED_RE =
  /gold[- ]plated|goldplated|baño de oro|bañad[oa]s? en oro|oro laminado|chapad[oa]s?( en oro)?|gilt\b|vermeil|gold ?wash|gold[- ]filled|goldfilled|gold tone|goldtone|color oro|imitation gold|fake gold/;

const SOUVENIR_RE =
  /\bsouvenir\b|tourist (coin|piece|copy)|fantasy (issue|piece)|gold[- ]plated replica/;

/** Historic gold that trades near melt (soberanos, napoleones, marengos, águilas USA…). */
const INVESTMENT_GOLD_RE =
  /\b(sovereign|soberano|half sovereign|media soberana|napole[oó]n|vreneli|helvetia|marengo|ducat|ducado|guinea)\b|\b(5|10|20|40|50|100)\s*francs?\b|\b(5|10|20|40|50|100)\s*francos?\b|\b(5|10|20|50|100)\s*lire\b|\b(5|10|20)\s*marks?\b|\b(5|10|20)\s*marcos?\b|\b(5|10)\s*gulden\b|\b10\s*guilders?\b|\b(5|7[.,]5|10|15)\s*rubl|\b(2\.5|2½|2|5|10|20)\s*pesos\b|\$(20|10|5|2\.?50)\b|double eagle|saint[-\s]?gaudens|liberty head|indian head (eagle|quarter)|half eagle|quarter eagle|\b(2|5)\s*pounds\b|cinco libras|dos libras|\b(4|8)\s*florin|\b(10|20|100)\s*coronas?\b|\b(10|20)\s*korona|\b(10|20)\s*kroner\b|\b(10|20)\s*kronor\b|4\.?000\s*r[eé]is|6\.?400\s*r[eé]is|\bpeça\b|\bpeca d[eo]\b/;

const SPANISH_COLLECTOR_RE =
  /escudo|onza|excelente|macuquina|\bcob\b|doubloon|100\s*pesetas|25\s*pesetas|10\s*pesetas|80\s*reales/;

const KNOWN_SOLID_RE =
  /escudo|onza|doubloon|excelente|sovereign|soberano|napole[oó]n|vreneli|helvetia|marengo|krugerrand|maple leaf|philharmonic|britannia|gold buffalo|centenario|double eagle|saint[-\s]?gaudens|half eagle|ducat|ducado|20\s*franc|20\s*mark|20\s*lire|100\s*pesetas|25\s*pesetas|10\s*pesetas|macuquina|\bcob\b|\$20\b|\$10\b|\$5\b|4\.?000\s*r[eé]is|6\.?400\s*r[eé]is|\bpeça\b|\bpeca d[eo]\b/;

function catalogBlob(id: CoinId): string {
  return `${id.title} ${id.denomination} ${id.seriesName} ${id.searchQuery}`.toLowerCase();
}

export function isPlatedGold(id: CoinId): boolean {
  if (id.goldForm === "plated" || id.goldForm === "gilt") return true;
  if (id.goldForm === "solid") return false;
  if (PLATED_RE.test(blobOf(id))) return true;
  // Souvenir wording on the title/query — not on identification, which may warn about fakes.
  return SOUVENIR_RE.test(catalogBlob(id));
}

export function inferGoldForm(id: CoinId): GoldForm {
  if (id.goldForm === "solid" || id.goldForm === "plated" || id.goldForm === "gilt") {
    return id.goldForm;
  }
  const blob = blobOf(id);
  if (PLATED_RE.test(blob) || SOUVENIR_RE.test(catalogBlob(id))) return "plated";
  if (id.metal === "gold" && !id.isLikelyReproduction) return "solid";
  if (KNOWN_SOLID_RE.test(blob) && !id.isLikelyReproduction) return "solid";
  return "unknown";
}

export function isSolidGold(id: CoinId): boolean {
  if (isPlatedGold(id)) return false;
  return inferGoldForm(id) === "solid" || (id.metal === "gold" && !id.isLikelyReproduction);
}

export function isModernBullion(id: CoinId): boolean {
  if (isPlatedGold(id)) return false;
  if (id.marketType === "bullion") return true;
  if (id.marketType === "numismatic") return false;
  const blob = blobOf(id);
  if (BULLION_RE.test(blob)) return true;
  // Common 50 pesos / Centenario bullion restrikes — not colonial gold.
  if (/50\s*pesos|centenario/.test(blob) && !/escudo/.test(blob)) return true;
  return false;
}

/** Historic gold that trades near melt (soberanos, napoleones, marengos…). */
export function isInvestmentGold(id: CoinId): boolean {
  if (!isSolidGold(id) || isModernBullion(id)) return false;
  if (SPANISH_COLLECTOR_RE.test(blobOf(id))) return false;
  return INVESTMENT_GOLD_RE.test(blobOf(id));
}

/**
 * Fine-metal grams when the model omits weight. Conservative catalogue figures.
 */
export function typicalFineWeightG(id: CoinId): number | null {
  if (id.estimatedFineWeightG && id.estimatedFineWeightG > 0) return id.estimatedFineWeightG;
  const blob = blobOf(id);
  const table: Array<{ re: RegExp; g: number }> = [
    { re: /1\/20\s*(oz|onza)/, g: 1.555 },
    { re: /1\/10\s*(oz|onza)|tenth ounce/, g: 3.11 },
    { re: /1\/4\s*(oz|onza)|quarter ounce/, g: 7.776 },
    { re: /1\/2\s*(oz|onza)|half ounce/, g: 15.552 },
    { re: /krugerrand|maple leaf|britannia|philharmonic|kangaroo|gold buffalo|chinese panda|(american )?gold eagle|1\s*(oz|onza) (gold|oro)/, g: 31.103 },
    { re: /50\s*pesos|centenario/, g: 37.5 },
    { re: /20\s*pesos/, g: 15.0 },
    { re: /10\s*pesos(?!etas)/, g: 7.5 },
    { re: /2\.5\s*pesos|2½\s*pesos/, g: 1.875 },
    { re: /5\s*pesos(?!etas)/, g: 3.75 },
    { re: /2\s*pesos(?!etas)/, g: 1.5 },
    { re: /8\s*escudos|ocho escudos|\bonza\b|doubloon/, g: 23.68 },
    { re: /4\s*escudos|cuatro escudos/, g: 11.84 },
    { re: /2\s*escudos|dos escudos/, g: 5.92 },
    { re: /1\/2\s*escudos?|medio escudo|half escudo/, g: 1.48 },
    { re: /1\s*escudo|un escudo/, g: 2.96 },
    { re: /100\s*pesetas/, g: 29.03 },
    { re: /25\s*pesetas/, g: 7.26 },
    { re: /10\s*pesetas/, g: 2.9 },
    { re: /10\s*escudos/, g: 7.56 },
    { re: /80\s*reales/, g: 6.77 },
    { re: /4\s*excelentes|doble excelente/, g: 14.0 },
    { re: /6\.?400\s*r[eé]is/, g: 14.34 },
    { re: /4\.?000\s*r[eé]is|\bpeça\b|\bpeca d[eo]/, g: 7.32 },
    { re: /double eagle|saint[-\s]?gaudens|\$20\b|20 dollars/, g: 30.09 },
    { re: /\$10\b|eagle.*indian|indian (head )?eagle/, g: 15.05 },
    { re: /half eagle|\$5\b|5 dollars/, g: 7.52 },
    { re: /quarter eagle|\$2\.?50\b/, g: 3.76 },
    { re: /5\s*pounds|cinco libras/, g: 36.61 },
    { re: /2\s*pounds|dos libras/, g: 14.64 },
    { re: /half sovereign|media soberana/, g: 3.661 },
    { re: /\b(sovereign|soberano)\b/, g: 7.322 },
    { re: /\bguinea\b/, g: 7.65 },
    { re: /100\s*francs|100\s*francos/, g: 29.03 },
    { re: /50\s*francs|50\s*francos/, g: 14.52 },
    { re: /40\s*francs|40\s*francos/, g: 11.61 },
    { re: /10\s*francs|10\s*francos/, g: 2.9 },
    { re: /napole[oó]n|20\s*francs|20\s*francos|vreneli|helvetia|marengo|20\s*lire/, g: 5.806 },
    { re: /100\s*lire/, g: 29.03 },
    { re: /50\s*lire/, g: 14.515 },
    { re: /10\s*lire/, g: 2.903 },
    { re: /20\s*mark|20\s*marcos/, g: 7.17 },
    { re: /10\s*mark|10\s*marcos/, g: 3.584 },
    { re: /10\s*gulden|10\s*guilders?/, g: 6.056 },
    { re: /15\s*rubl/, g: 11.61 },
    { re: /10\s*rubl/, g: 7.74 },
    { re: /7[.,]5\s*rubl/, g: 5.81 },
    { re: /5\s*rubl/, g: 4.3 },
    { re: /4\s*ducats|4\s*ducados/, g: 13.77 },
    { re: /\b(ducat|ducado)\b/, g: 3.44 },
    { re: /100\s*coronas?/, g: 30.49 },
    { re: /20\s*coronas?|20\s*korona/, g: 6.1 },
    { re: /10\s*coronas?|10\s*korona/, g: 3.05 },
    { re: /20\s*kroner|20\s*kronor/, g: 8.06 },
    { re: /10\s*kroner|10\s*kronor/, g: 4.03 },
    { re: /8\s*florin/, g: 5.81 },
    { re: /4\s*florin/, g: 2.9 },
  ];
  for (const row of table) {
    if (row.re.test(blob)) return row.g;
  }
  return null;
}

export function meltValue(id: CoinId, spots: MetalSpots | null): { eur: number; usd: number } | null {
  if (!spots || isPlatedGold(id)) return null;
  if (id.isLikelyReproduction && inferGoldForm(id) !== "solid") return null;
  const grams = typicalFineWeightG(id);
  if (grams == null || grams <= 0) return null;
  const oz = grams / TROY_OZ_G;
  if (id.metal === "gold" || inferGoldForm(id) === "solid") {
    return { eur: oz * spots.goldEur, usd: oz * spots.goldUsd };
  }
  if (id.metal === "silver") return { eur: oz * spots.silverEur, usd: oz * spots.silverUsd };
  return null;
}

type FloorRule = { re: RegExp; circ: number; xf: number; au: number; ms: number };

const COLLECTOR_FLOORS_EUR: FloorRule[] = [
  // Spanish / colonial gold — the ~€10k undervaluation class.
  { re: /8\s*escudos|ocho escudos|\bonza\b|doubloon/, circ: 6500, xf: 9500, au: 12500, ms: 18000 },
  { re: /4\s*escudos|cuatro escudos/, circ: 2200, xf: 3500, au: 5000, ms: 8000 },
  { re: /2\s*escudos|dos escudos/, circ: 900, xf: 1400, au: 2200, ms: 3500 },
  { re: /1\/2\s*escudos?|medio escudo|half escudo/, circ: 280, xf: 450, au: 700, ms: 1200 },
  { re: /\b1\s*escudos?\b|\bun escudo\b/, circ: 450, xf: 750, au: 1200, ms: 2200 },
  { re: /4\s*excelentes|doble excelente|reyes cat[oó]licos/, circ: 7000, xf: 11000, au: 15000, ms: 22000 },
  { re: /100\s*pesetas/, circ: 3500, xf: 5500, au: 8000, ms: 14000 },
  { re: /25\s*pesetas/, circ: 800, xf: 1200, au: 1800, ms: 3000 },
  { re: /10\s*pesetas/, circ: 380, xf: 550, au: 850, ms: 1600 },
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
  if (isPlatedGold(id) || isModernBullion(id) || isInvestmentGold(id)) return null;
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
 * Oro macizo de inversión (soberano, napoleón, $20) se queda cerca de fundición.
 */
export function numismaticMeltMultiplier(id: CoinId): number {
  if (isPlatedGold(id) || id.isLikelyReproduction || id.confidence === "low") return 1;
  if (isModernBullion(id)) {
    const g = typicalFineWeightG(id) ?? 31;
    if (g <= 4) return 1.16;
    if (g <= 8) return 1.1;
    if (g <= 16) return 1.07;
    return 1.04;
  }
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
  if (/2\s*escudos|dos escudos/.test(blob)) return byBand(1.8, 2.6, 3.6, 5);
  if (/1\/2\s*escudos?|medio escudo|half escudo/.test(blob)) return byBand(1.5, 2.0, 2.8, 4);
  if (/\b1\s*escudos?\b|\bun escudo\b/.test(blob)) return byBand(1.7, 2.4, 3.4, 5);
  if (/4\s*excelentes|doble excelente|reyes cat[oó]licos/.test(blob)) return byBand(3, 4.5, 6, 8);
  if (/100\s*pesetas/.test(blob)) return byBand(1.6, 2.4, 3.2, 5);
  if (/25\s*pesetas/.test(blob)) return byBand(1.4, 1.8, 2.4, 3.5);
  if (/10\s*pesetas/.test(blob)) return byBand(1.25, 1.55, 2.0, 3.2);
  if (/\bcob\b|macuquina/.test(blob)) return byBand(2, 3, 4.5, 6);
  if (/10\s*escudos/.test(blob)) return byBand(1.8, 2.5, 3.4, 5);
  if (/80\s*reales/.test(blob)) return byBand(1.5, 2.0, 2.8, 4);
  if (isInvestmentGold(id)) return byBand(1.04, 1.08, 1.12, 1.22);
  if (isSolidGold(id) && id.marketType !== "bullion") return byBand(1.15, 1.4, 1.7, 2.2);
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

function guardCopy(lang: "es" | "en") {
  if (lang === "en") {
    return {
      plated:
        "Not solid gold (plated/gilt replica): melt value of gold is not applied.",
      collector: (eur: number) =>
        `Collector market floor applied (€${eur}): melt is not the price of this piece.`,
      premium: (mult: number, meltEur: number) =>
        `Minimum premium ×${mult.toFixed(2)} over melt (${roundMoney(meltEur)} €).`,
    };
  }
  return {
    plated:
      "No es oro macizo (baño/laminado o réplica chapada): no se aplica el valor de fundición del oro.",
    collector: (eur: number) =>
      `Suelo de mercado coleccionista aplicado (${eur} €): la fundición no es el precio de esta pieza.`,
    premium: (mult: number, meltEur: number) =>
      `Prima mínima ×${mult.toFixed(2)} sobre fundición (${roundMoney(meltEur)} €).`,
  };
}

export function goldBreakdownLine(
  id: CoinId,
  melt: { eur: number; usd: number } | null,
  range: MoneyRange,
  lang: "es" | "en" = "es",
): string {
  if (isPlatedGold(id)) {
    return lang === "en"
      ? "Not solid gold (plated/gilt). Souvenir price — no melt value."
      : "No es oro macizo (baño o laminado). Precio de souvenir, sin valor de fundición.";
  }
  if (!isSolidGold(id) || !melt) return "";
  const grams = typicalFineWeightG(id);
  const mid = (range.priceEurMin + range.priceEurMax) / 2;
  const prima = melt.eur > 0 ? mid / melt.eur : 1;
  const g = grams != null ? String(grams) : "?";
  if (lang === "en") {
    return `Solid gold · ${g} g fine · melt ${roundMoney(melt.eur)} € · market premium ×${prima.toFixed(2)}.`;
  }
  return `Oro macizo · ${g} g fino · fundición ${roundMoney(melt.eur)} € · prima de mercado ×${prima.toFixed(2)}.`;
}

/** Chips for the result card: solid vs plated, fine grams, melt, premium. */
export function extractGoldChips(notes?: string | null): string[] {
  if (!notes) return [];
  const out: string[] = [];
  const add = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  if (/no es oro macizo|not solid gold/i.test(notes)) add("Baño de oro");
  else if (/oro macizo|solid gold/i.test(notes)) add("Oro macizo");
  const g = notes.match(/(\d+(?:[.,]\d+)?)\s*g\s*fin[oae]/i);
  if (g?.[1]) add(`${g[1].replace(",", ".")} g fino`);
  const melt =
    notes.match(/fundici[oó]n\s+(\d[\d.\s]*)\s*€/i) || notes.match(/\bmelt\s+(\d[\d.\s]*)\s*€/i);
  if (melt?.[1]) add(`Fundición ${melt[1].trim().replace(/\s+/g, "")} €`);
  const prima =
    notes.match(/prima(?: mínima| de mercado)?\s*×\s*(\d+[.,]\d+)/i) ||
    notes.match(/premium\s*×\s*(\d+[.,]\d+)/i);
  if (prima?.[1]) add(`Prima ×${prima[1]}`);
  return out.slice(0, 4);
}

const COIN_HINT_RE =
  /\b(coin|coins|moneda|monedas|billete|billetes|banknote|numismatic|numismática|numismatica|ngc|pcgs|escudo|escudos|onza|doubloon|peseta|pesetas|oro macizo|soberano|sovereign|napole[oó]n|krugerrand|maple leaf|philharmonic|britannia|macuquina|\bcob\b|ducat|ducado|vreneli|marengo|helvetia|double eagle|saint[-\s]?gaudens|excelente|gold coin|gold eagle|4\.?000\s*r[eé]is|6\.?400\s*r[eé]is|peça)\b/i;

export function looksLikeCoinText(text: string): boolean {
  return COIN_HINT_RE.test(text);
}

/** Build a CoinId from a generic appraisal so melt/collector guards still apply. */
export function coinIdFromText(
  title: string,
  extra = "",
  confidence: CoinId["confidence"] = "medium",
): CoinId {
  const blob = `${title} ${extra}`;
  const lower = blob.toLowerCase();
  const certifier: CoinCertifier = /\bngc\b/i.test(blob)
    ? "NGC"
    : /\bpcgs\b/i.test(blob)
      ? "PCGS"
      : /\banacs\b/i.test(blob)
        ? "ANACS"
        : "unknown";
  const metal: CoinMetal = /oro|gold|escudo|sovereign|soberano|napole|krugerrand|onza|doubloon|ducat|águila|eagle|peça|peca|r[eé]is/.test(
    lower,
  )
    ? "gold"
    : /plata|silver/.test(lower)
      ? "silver"
      : "unknown";
  const draft: CoinId = {
    title: title.slice(0, 200),
    country: "",
    denomination: "",
    year: "",
    mint: "",
    seriesName: "",
    metal,
    estimatedFineWeightG: null,
    certifier,
    grade: null,
    isLikelyReproduction: /r[eé]plica|souvenir|gold[- ]plated|baño de oro/.test(lower),
    marketType: "unknown",
    goldForm: "unknown",
    identification: extra.slice(0, 2000),
    searchQuery: title.slice(0, 220),
    confidence,
  };
  const goldForm = inferGoldForm(draft);
  return {
    ...draft,
    goldForm,
    estimatedFineWeightG: typicalFineWeightG({ ...draft, goldForm }),
  };
}

/**
 * Apply melt floor + collector floor + numismatic multiplier.
 * Mutates nothing; returns a new range.
 */
export function applyCoinPriceGuards(
  result: MoneyRange,
  id: CoinId,
  spots: MetalSpots | null,
  lang: "es" | "en" = "es",
): MoneyRange {
  const copy = guardCopy(lang);

  if (isPlatedGold(id)) {
    const blob = blobOf(id);
    const looksLikeGoldCoin = /escudo|onza|doubloon|sovereign|soberano|napole|peseta|krugerrand|eagle/.test(
      blob,
    );
    if (looksLikeGoldCoin && result.priceEurMin > 150) {
      const note = copy.plated;
      return {
        priceEurMin: 15,
        priceEurMax: 80,
        priceUsdMin: 16,
        priceUsdMax: 90,
        notes: result.notes.includes(note.slice(0, 40))
          ? result.notes
          : `${result.notes}\n${note}`.slice(0, 4000),
      };
    }
    const breakdown = goldBreakdownLine(id, null, result, lang);
    return breakdown && !result.notes.includes(breakdown.slice(0, 32))
      ? { ...result, notes: `${result.notes}\n${breakdown}`.slice(0, 4000) }
      : result;
  }

  let next = { ...result };
  const melt = meltValue(id, spots);
  const fx = spots?.eurPerUsd || 0.86;

  const floorEur = collectorFloorEur(id);
  if (floorEur && floorEur > 0) {
    next = liftMin(next, floorEur, Math.round(floorEur / fx), copy.collector(floorEur));
  }

  const mult = numismaticMeltMultiplier(id);
  if (melt && mult > 1.01) {
    next = liftMin(next, melt.eur * mult, melt.usd * mult, copy.premium(mult, melt.eur));
  }

  // Oro macizo: la fundición es suelo físico aunque la pieza sea copia o la confianza baja.
  if (melt && isSolidGold(id)) {
    next = liftMin(next, melt.eur, melt.usd, "");
  } else if (melt && id.confidence !== "low") {
    next = liftMin(next, melt.eur * 0.95, melt.usd * 0.95, "");
  }

  const breakdown = goldBreakdownLine(id, melt, next, lang);
  if (breakdown && !next.notes.includes(breakdown.slice(0, 24))) {
    next = { ...next, notes: `${next.notes}\n${breakdown}`.slice(0, 4000) };
  }

  return next;
}
