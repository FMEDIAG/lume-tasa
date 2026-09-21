import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  chatCompletion,
  clientIp,
  getMetalSpots,
  isAllowedOrigin,
  requestOriginHost,
  roundMoney,
  type MetalSpots,
} from "@/lib/lume-ai";
import {
  applyCoinPriceGuards,
  coinIdFromText,
  inferGoldForm,
  looksLikeCoinText,
  typicalFineWeightG,
  type CoinCertifier,
  type CoinId,
  type CoinMarketType,
  type CoinMetal,
  type GoldForm,
} from "@/lib/coin-floors";

const MAX_PHOTO_CHARS = 1_500_000;
const MAX_TOTAL_PHOTO_CHARS = 6_000_000;

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

const PhotoSchema = z.object({
  dataUrl: z
    .string()
    .max(MAX_PHOTO_CHARS, "Photo too large")
    .regex(DATA_URL_RE, "Unsupported or malformed image data URL"),
});

const InputSchema = z
  .object({
    photos: z.array(PhotoSchema).min(1).max(3),
    context: z.string().trim().min(1, "Context is required").max(500),
    category: z.string().max(50).optional().default("auto"),
    condition: z.string().max(30).optional().default("unknown"),
    lang: z.enum(["es", "en"]).default("es"),
  })
  .refine(
    (val) => val.photos.reduce((sum, p) => sum + p.dataUrl.length, 0) <= MAX_TOTAL_PHOTO_CHARS,
    { message: "Total photo payload too large" },
  );

const ResultSchema = z.object({
  title: z.string().max(200),
  identification: z.string().max(2000),
  priceEurMin: z.number().finite().nonnegative().max(500_000_000),
  priceEurMax: z.number().finite().nonnegative().max(500_000_000),
  priceUsdMin: z.number().finite().nonnegative().max(500_000_000),
  priceUsdMax: z.number().finite().nonnegative().max(500_000_000),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string().max(4000),
  sources: z.array(z.string().max(200)).max(8),
});

export type ValuationResult = z.infer<typeof ResultSchema>;

const RATE_LIMIT_MAX = 8;
const RATE_LIMIT_WINDOW_MS = 60_000;
const GLOBAL_MAX = 200;
const MAX_TRACKED_KEYS = 5_000;

const rateBuckets = new Map<string, number[]>();
let globalHits: number[] = [];
let lastSweep = Date.now();

function sweepStaleBuckets(now: number) {
  if (now - lastSweep < RATE_LIMIT_WINDOW_MS) return;
  lastSweep = now;
  for (const [key, arr] of rateBuckets) {
    const fresh = arr.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) rateBuckets.delete(key);
    else rateBuckets.set(key, fresh);
  }
  if (rateBuckets.size > MAX_TRACKED_KEYS) {
    const excess = rateBuckets.size - MAX_TRACKED_KEYS;
    let i = 0;
    for (const key of rateBuckets.keys()) {
      if (i++ >= excess) break;
      rateBuckets.delete(key);
    }
  }
}

function pruneAndCheck(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweepStaleBuckets(now);
  const arr = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

function checkGlobal(): boolean {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (globalHits.length >= GLOBAL_MAX) return false;
  globalHits.push(now);
  return true;
}

function toNumberLoose(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return NaN;
  const cleaned = val.trim();
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) normalized = cleaned.replace(/\./g, "").replace(",", ".");
    else normalized = cleaned.replace(/,/g, "");
  } else if (lastComma > -1) {
    normalized = cleaned.replace(",", ".");
  }
  return parseFloat(normalized);
}

function isCoinValuation(category: string, context: string): boolean {
  return looksLikeCoinText(`${category} ${context}`);
}

const CoinIdSchema = z.object({
  title: z.string().max(200),
  country: z.string().max(80).optional().default(""),
  denomination: z.string().max(80).optional().default(""),
  year: z.string().max(40).optional().default(""),
  mint: z.string().max(40).optional().default(""),
  seriesName: z.string().max(160).optional().default(""),
  metal: z.enum([
    "gold",
    "silver",
    "platinum",
    "copper",
    "bimetallic",
    "paper",
    "unknown",
  ]) as z.ZodType<CoinMetal>,
  estimatedFineWeightG: z.number().finite().nonnegative().max(2000).nullable().optional(),
  certifier: z.enum(["NGC", "PCGS", "ANACS", "ICG", "none", "unknown"]) as z.ZodType<CoinCertifier>,
  grade: z.string().max(40).nullable().optional(),
  certNumber: z.string().max(40).nullable().optional(),
  isLikelyReproduction: z.boolean().optional().default(false),
  marketType: z.enum(["bullion", "numismatic", "unknown"]).optional().default("unknown") as z.ZodType<
    CoinMarketType
  >,
  goldForm: z.enum(["solid", "plated", "gilt", "unknown"]).optional().default("unknown") as z.ZodType<GoldForm>,
  identification: z.string().max(2000),
  searchQuery: z.string().max(220),
  confidence: z.enum(["low", "medium", "high"]),
});

const CoinPriceSchema = z.object({
  meltEur: z.number().finite().nonnegative().max(500_000_000),
  meltUsd: z.number().finite().nonnegative().max(500_000_000),
  marketEurMin: z.number().finite().nonnegative().max(500_000_000),
  marketEurMax: z.number().finite().nonnegative().max(500_000_000),
  marketUsdMin: z.number().finite().nonnegative().max(500_000_000),
  marketUsdMax: z.number().finite().nonnegative().max(500_000_000),
  notes: z.string().max(4000),
  sources: z.array(z.string().max(200)).max(8),
  comparable: z.string().max(400).optional().default(""),
});

function photoContent(photos: Array<{ dataUrl: string }>, text: string) {
  return [
    { type: "text", text },
    ...photos.map((p) => ({
      type: "image_url",
      image_url: { url: p.dataUrl, detail: "high" },
    })),
  ];
}

async function identifyCoin(
  data: z.infer<typeof InputSchema>,
): Promise<CoinId> {
  const lang = data.lang;
  const system =
    lang === "es"
      ? `Eres un numismático identificador. Mira las fotos (anverso, reverso y, si hay, la etiqueta del slab) y identifica la pieza con precisión. NO des precio.
Lee TODO el texto visible: país, denominación, año, ceca, metal, certificadora (NGC/PCGS/ANACS/ICG), grado (MS/AU/XF/VF/PR + número) y número de certificación.
Si hay varias monedas, identifica la de mayor valor probable.
Pesos típicos de fino: 8 escudos/onza ~23.7 g, 4 escudos ~11.8 g, 2 escudos ~5.9 g, 1 escudo ~3.0 g, medio escudo ~1.5 g, soberano ~7.32 g, 20 francos/napoleón/marengo/vreneli ~5.81 g, 100 pesetas ~29.0 g, 25 pesetas ~7.3 g, 10 pesetas ~2.9 g, peça/4000 réis ~7.32 g, 6400 réis ~14.34 g, $20 double eagle ~30.1 g, $10 eagle ~15.0 g, Krugerrand/Maple/Eagle 1 oz ~31.1 g.

ORO MACIZO vs BAÑO — decisión crítica:
- goldForm="solid" si es oro de ley (macizo): color homogéneo, desgaste que sigue siendo amarillo, canto vivo, peso coherente con catálogo, texto "AU", ".900", ".916", "22K", "24K", "oro", "gold".
- goldForm="plated" o "gilt" si es baño/laminado: desgaste que enseña metal blanco o rojo, color demasiado brillante o anaranjado, "COPY", "REPLICA", "gold plated", "baño de oro", costura de fundición, imán, peso irreal para el módulo.
- Las onzas/8 escudos de souvenir casi siempre son chapadas: si hay duda, plated + isLikelyReproduction true.
- Un soberano, napoleón, 20 francos, 10/25/100 pesetas, 1/2/4/8 escudos auténtico, peça/4000 réis o Krugerrand es SIEMPRE solid.
- Copia fundida en oro de ley: goldForm="solid" + isLikelyReproduction true (la fundición SÍ es suelo; la prima coleccionista NO).

marketType: "bullion" SOLO si es lingote moderno (Krugerrand, Maple Leaf, American Eagle, Philharmonic, Britannia, Nugget, Panda, Libertad, 50 pesos Centenario común). Oro español colonial, escudos, onzas, excelentes, doblones, pesetas de oro, macuquinas = "numismatic" SIEMPRE.
Devuelve SOLO JSON con: title, country, denomination, year, mint, seriesName, metal (gold|silver|platinum|copper|bimetallic|paper|unknown), estimatedFineWeightG (gramos de metal fino, o null), certifier (NGC|PCGS|ANACS|ICG|none|unknown), grade, certNumber, isLikelyReproduction, marketType (bullion|numismatic|unknown), goldForm (solid|plated|gilt|unknown), identification (párrafo técnico: macizo o baño, ley, peso), searchQuery (consulta corta en inglés para NGC/Heritage: país + denominación + año + ceca + grado), confidence (low|medium|high).`
      : `You are a numismatic identifier. Look at the photos (obverse, reverse and slab label if present) and identify the piece precisely. Do NOT give a price.
Read ALL visible text: country, denomination, year, mint, metal, certifier (NGC/PCGS/ANACS/ICG), grade (MS/AU/XF/VF/PR + number) and cert number.
If several coins are shown, identify the highest-value one.
Typical fine weights: 8 escudos/onza ~23.7 g, 4 escudos ~11.8 g, 2 escudos ~5.9 g, 1 escudo ~3.0 g, half escudo ~1.5 g, sovereign ~7.32 g, 20 francs/Napoléon/Marengo/Vreneli ~5.81 g, 100 pesetas ~29.0 g, 25 pesetas ~7.3 g, 10 pesetas ~2.9 g, peça/4000 réis ~7.32 g, 6400 réis ~14.34 g, $20 double eagle ~30.1 g, $10 eagle ~15.0 g, Krugerrand/Maple/Eagle 1 oz ~31.1 g.

SOLID GOLD vs PLATED — critical call:
- goldForm="solid" for genuine karat gold: even colour, wear still yellow, correct catalogue weight, "AU", ".900", ".916", "22K", "24K".
- goldForm="plated" or "gilt" if gold-washed: wear shows white/red base metal, too-bright colour, "COPY"/"REPLICA"/"gold plated", casting seam, magnet, impossible weight.
- Tourist 8 escudos / onza souvenirs are almost always plated: if unsure, plated + isLikelyReproduction true.
- A genuine sovereign, Napoléon, 20 francs, 10/25/100 pesetas, 1/2/4/8 escudos, peça/4000 réis or Krugerrand is ALWAYS solid.
- Cast copy in karat gold: goldForm="solid" + isLikelyReproduction true (melt IS the floor; collector premium is NOT).

marketType: "bullion" ONLY for modern bullion (Krugerrand, Maple Leaf, American Eagle, Philharmonic, Britannia, Nugget, Panda, Libertad, common 50 pesos Centenario). Spanish colonial gold, escudos, onzas, excelentes, doubloons, gold pesetas, cobs = ALWAYS "numismatic".
Return ONLY JSON with: title, country, denomination, year, mint, seriesName, metal (gold|silver|platinum|copper|bimetallic|paper|unknown), estimatedFineWeightG (fine metal grams, or null), certifier (NGC|PCGS|ANACS|ICG|none|unknown), grade, certNumber, isLikelyReproduction, marketType (bullion|numismatic|unknown), goldForm (solid|plated|gilt|unknown), identification (technical paragraph: solid vs plated, fineness, weight), searchQuery (short English NGC/Heritage query: country + denomination + year + mint + grade), confidence (low|medium|high).`;

  const user =
    (lang === "es"
      ? "Identifica esta moneda/billete. Contexto del usuario: "
      : "Identify this coin/banknote. User context: ") + (data.context || "(none)");

  const { text } = await chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: photoContent(data.photos, user) },
    ],
    json: true,
    search: false,
    timeoutMs: 45_000,
    maxTokens: 1200,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Coin identification was not valid JSON");
  }
  const id = CoinIdSchema.parse(parsed);
  const withForm = { ...id, goldForm: inferGoldForm(id) };
  const weight = typicalFineWeightG(withForm);
  return weight && (!withForm.estimatedFineWeightG || withForm.estimatedFineWeightG <= 0)
    ? { ...withForm, estimatedFineWeightG: weight }
    : withForm;
}

async function priceCoin(
  data: z.infer<typeof InputSchema>,
  id: CoinId,
  spots: MetalSpots | null,
): Promise<ValuationResult> {
  const lang = data.lang;
  const spotLine = spots
    ? lang === "es"
      ? `Cotización OBLIGATORIA a usar (no inventes otra): oro ${roundMoney(spots.goldUsd)} USD/oz troy (${roundMoney(spots.goldEur)} EUR/oz), plata ${roundMoney(spots.silverUsd)} USD/oz (${roundMoney(spots.silverEur)} EUR/oz). Cambio USD→EUR ${spots.eurPerUsd.toFixed(4)}.`
      : `MANDATORY spot to use (do not invent another): gold ${roundMoney(spots.goldUsd)} USD/troy oz (${roundMoney(spots.goldEur)} EUR/oz), silver ${roundMoney(spots.silverUsd)} USD/oz (${roundMoney(spots.silverEur)} EUR/oz). USD→EUR ${spots.eurPerUsd.toFixed(4)}.`
    : lang === "es"
      ? "No hay cotización en vivo: busca el spot actual de oro y plata antes de calcular la fundición."
      : "No live spot available: look up current gold and silver spot before computing melt.";

  const system =
    lang === "es"
      ? `Eres un tasador numismático. Tienes búsqueda web. Debes tasar ESTA pieza concreta, no una media de la serie.

REGLA DE ORO — el fallo que hay que evitar:
Devolver el valor de fundición (o un precio genérico de "moneda de oro") cuando el mercado de coleccionista está miles de euros por encima. Un error de ~10.000 € a la baja es inaceptable. Fundición es el SUELO, nunca el precio de venta si existen comparables.

ORO MACIZO vs BAÑO:
- goldForm plated/gilt: meltEur=0. Precio de souvenir/réplica (típicamente 5-80 €). NUNCA asignes el oro que "parecería" pesar.
- goldForm solid: calcula fundición con el spot dado y úsala como SUELO. Precio = fundición + prima.
  · Lingote moderno (Krugerrand, Maple, Eagle): prima 3-8 % (fracciones 8-18 %).
  · Soberano, napoleón, 20 francos, marengo, vreneli, 20 marcos, 20 liras, $20/$10/$5 USA comunes, peça/4000 réis portuguesa: fecha común → prima 4-12 %.
  · Escudos (1, 2, 4, 8), onzas, excelentes, 100/25/10 pesetas, macuquinas: mercado coleccionista (cientos o miles por encima de fundición). Un 1 escudo auténtico no vale la fundición (~300 €); un 8 escudos no vale ~2.500 €; un 10 pesetas de oro no vale ~300 €.

Pasos:
1. Calcula meltEur/meltUsd = (gramos de fino / 31.1035) × spot SOLO si es oro macizo. ${spotLine}
2. BUSCA el precio de MERCADO de esta pieza exacta: país + denominación + año + ceca + grado + certificadora.
   Consultas útiles: "${id.searchQuery}", "NGC Price Guide", "PCGS CoinFacts", "Heritage Auctions sold", "Áureo & Calicó", "Jesús Vico", "Cayón", "Numista", "MA-Shops", eBay sold.
3. price = rango de mercado (venta real / guía NGC-PCGS). Si hay comparable de subasta, ÚSALO. No sustituyas un 8 escudos / 4 escudos / 2 escudos / 1 escudo / onza / 100 pesetas / 10 pesetas / $20 Liberty o Saint-Gaudens / 50 pesos Mexicanos por "el oro que pesa".
4. Si está encapsulada MS/PR/PF, la prima numismática suele ser el componente PRINCIPAL del precio.
5. Reproducción o duda fuerte: confidence low. Si goldForm=solid, el suelo es la fundición (nunca 0). Si plated/gilt, 5-80 €.
6. En notes incluye: identificación | macizo o baño | fino | spot | fundición | comparable | precio de mercado.

Devuelve SOLO JSON: meltEur, meltUsd, marketEurMin, marketEurMax, marketUsdMin, marketUsdMax, notes, sources (array), comparable (una frase con la venta o guía usada).`
      : `You are a numismatic appraiser with live web search. Value THIS specific piece, not a series average.

GOLDEN RULE — the failure to avoid:
Returning melt value (or a generic "gold coin" price) when collector market is thousands of euros higher. A ~€10,000 undervaluation is unacceptable. Melt is the FLOOR, never the asking price when comparables exist.

SOLID GOLD vs PLATED:
- goldForm plated/gilt: meltEur=0. Souvenir/replica price (typically EUR 5-80). NEVER assign the gold it "would" weigh.
- goldForm solid: compute melt with the given spot and use it as FLOOR. Price = melt + premium.
  · Modern bullion (Krugerrand, Maple, Eagle): 3-8% premium (fractions 8-18%).
  · Sovereign, Napoléon, 20 francs, Marengo, Vreneli, 20 mark, 20 lire, common-date US $20/$10/$5, Portuguese peça/4000 réis: common date → 4-12% premium.
  · Escudos (1, 2, 4, 8), onzas, excelentes, 100/25/10 pesetas, cobs: collector market (hundreds or thousands above melt). A genuine 1 escudo is not melt (~€300); an 8 escudos is not ~€2,500; a gold 10 pesetas is not ~€300.

Steps:
1. Compute meltEur/meltUsd = (fine grams / 31.1035) × spot ONLY if solid gold. ${spotLine}
2. SEARCH the MARKET price of this exact piece: country + denomination + year + mint + grade + certifier.
   Useful queries: "${id.searchQuery}", NGC Price Guide, PCGS CoinFacts, Heritage Auctions sold, Áureo & Calicó, Jesús Vico, Cayón, Numista, MA-Shops, eBay sold.
3. Price = market range (actual sales / NGC-PCGS guide). If an auction comparable exists, USE IT. Do not substitute an 8 escudos / 4 escudos / 2 escudos / 1 escudo / onza / 100 pesetas / 10 pesetas / $20 Liberty or Saint-Gaudens / Mexican 50 pesos with "the gold it weighs".
4. If slabbed MS/PR/PF, the numismatic premium is usually the MAIN component of the price.
5. Reproduction or strong doubt: low confidence. If goldForm=solid, melt is the floor (never 0). If plated/gilt, EUR 5-80.
6. In notes include: ID | solid vs plated | fine weight | spot | melt | comparable | market price.

Return ONLY JSON: meltEur, meltUsd, marketEurMin, marketEurMax, marketUsdMin, marketUsdMax, notes, sources (array), comparable (one sentence with the sale or guide used).`;

  const user = JSON.stringify(
    {
      title: id.title,
      country: id.country,
      denomination: id.denomination,
      year: id.year,
      mint: id.mint,
      seriesName: id.seriesName,
      metal: id.metal,
      estimatedFineWeightG: id.estimatedFineWeightG,
      certifier: id.certifier,
      grade: id.grade,
      certNumber: id.certNumber,
      isLikelyReproduction: id.isLikelyReproduction,
      marketType: id.marketType,
      goldForm: id.goldForm,
      identification: id.identification,
      userContext: data.context || "",
      condition: data.condition,
      lang,
    },
    null,
    2,
  );

  const { text, citations } = await chatCompletion({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    json: true,
    search: true,
    timeoutMs: 75_000,
    maxTokens: 1800,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Coin pricing was not valid JSON");
  }
  const price = CoinPriceSchema.parse(parsed);

  const sources = [...price.sources, ...citations.map((c) => c.slice(0, 200))].filter(Boolean);
  const uniqueSources = Array.from(new Set(sources)).slice(0, 8);

  const notesExtra =
    price.comparable && !price.notes.includes(price.comparable)
      ? `\n${lang === "es" ? "Comparable" : "Comparable"}: ${price.comparable}`
      : "";

  let result: ValuationResult = {
    title: id.title.slice(0, 200),
    identification: id.identification.slice(0, 2000),
    priceEurMin: roundMoney(price.marketEurMin),
    priceEurMax: roundMoney(price.marketEurMax),
    priceUsdMin: roundMoney(price.marketUsdMin),
    priceUsdMax: roundMoney(price.marketUsdMax),
    confidence: id.isLikelyReproduction ? "low" : id.confidence,
    notes: (price.notes + notesExtra).slice(0, 4000),
    sources: uniqueSources,
  };

  if (result.priceEurMax < result.priceEurMin) result.priceEurMax = result.priceEurMin;
  if (result.priceUsdMax < result.priceUsdMin) result.priceUsdMax = result.priceUsdMin;

  const guarded = applyCoinPriceGuards(result, id, spots, lang);
  return ResultSchema.parse({ ...result, ...guarded });
}

const systemEs = `Eres un tasador experto que consulta bases de datos públicas de todo el mundo (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analiza las fotos y devuelve una tasación honesta con rangos de precio realistas en EUR y USD. Si no puedes identificar el objeto con seguridad, indícalo y usa confianza "low", y en ese caso NO inventes un precio: usa 0 en los campos de precio. Para cartas coleccionables (Magic: The Gathering, Pokémon, Yu-Gi-Oh, deportes, etc.) IDENTIFICA CON PRECISIÓN la edición/set exacto usando el símbolo de expansión, el número de colección, el año, el idioma, el borde (blanco/negro), foil/no-foil y el estado (NM/LP/MP/HP/DMG). Consulta referencias específicas (Scryfall, MTGGoldfish, TCGPlayer, Cardmarket para Magic; TCGPlayer/PriceCharting para Pokémon) y considera TODAS las ediciones posibles antes de dar el precio. Si identificas con confianza media o alta una carta u objeto coleccionable común de valor muy bajo (bulk), asigna un rango mínimo de mercado real de céntimos (ej. 0.02 - 0.10 EUR/USD) en vez de 0. Indica en "notes" la edición identificada y menciona alternativas si hay duda. Para VEHÍCULOS A MOTOR (categoría vehicles: coches, motocicletas, vehículos históricos, furgonetas, camiones ligeros, etc.) identifica marca, modelo, generación aproximada, motorización, kilometraje aparente y estado visual. Consulta referencias como eBay sold listings, Mobile.de, Autoscout24, Classic.com, Bring a Trailer y Hemmings; ajusta por mercado europeo (EUR) y estadounidense (USD). Para embarcaciones (categoría boats: yates, veleros, lanchas, barcos de pesca, jet skis, neumáticas, etc.) identifica tipo, eslora aproximada, marca/modelo del casco y motor, antigüedad, estado de conservación y equipamiento visible. Consulta referencias como YachtWorld, Boat Trader, Annonces du Bateau, TopBoats y Band of Boats; ten en cuenta que los precios varían mucho según país, temporada y estado. Para INMUEBLES (categoría realestate: pisos, casas, villas, chalets, locales, terrenos, edificios) NO apliques suelos de céntimos ni techos artificiales: estima el valor de mercado real, que puede ser de cientos de miles a decenas de millones de euros. Calcula SIEMPRE el precio como superficie × precio/m² de la microzona, antes de ajustar por estado y singularidad. El contexto del usuario sobre ubicación, m² y tipología prevalece sobre cualquier inferencia visual; no reduzcas la superficie indicada. Distingue estrictamente un apartamento pequeño de una residencia de 3+ dormitorios, dúplex, planta completa o >150 m². Si faltan m², estima un intervalo de superficie coherente y calcula ambos extremos. Para lujo usa comparables de Idealista, Fotocasa, Sotheby's Realty, Christie's Real Estate y Engel & Völkers; no limites el resultado a 1.000.000 € y explica en "notes" superficie, horquilla €/m², primas y cálculo final. Para BONSÁIS (categoría bonsai) identifica especie, estilo (chokkan, moyogi, kengai, forest, etc.), edad aproximada por grosor de tronco y nebari, calidad de la ramificación y estado de salud visible; ten en cuenta si la maceta es de autor (Tokoname, Yixing) y súmala aparte si es apreciable. Consulta Bonsai Empire, viveros y subastas especializadas, y eBay sold listings; los precios van desde 20-30 € en material de partida hasta varios miles en ejemplares de estilo maduro. Para VINO Y LICORES (categoría wine) identifica productor, denominación de origen o región, añada, formato de botella y estado de conservación (nivel de llenado, etiqueta, cápsula, corcho); consulta Wine-Searcher, iDealwine, Vinfolio y casas como Sotheby's/Christie's Wine o Whisky Auctioneer para licores. Para MUEBLES ANTIGUOS (categoría furniture) identifica estilo y época (Isabelino, Luis XV, Art Déco, medio siglo, etc.), material, posibles marcas de ebanista o taller, y estado/restauraciones; consulta Catawiki, 1stDibs, Invaluable y los departamentos de mobiliario de Christie's/Sotheby's. Para MILITARIA (categoría militaria) identifica conflicto/época, país, unidad y tipo de pieza (medalla, insignia, uniforme, documento), y sé explícito si parece una reproducción moderna en vez de una pieza original, ya que el precio varía drásticamente; consulta Hermann Historica, Bonhams Arms & Militaria y eBay sold listings. Para BOLSOS Y COMPLEMENTOS DE LUJO (categoría luxury bags) identifica marca, modelo, línea, materiales, herrajes y posibles indicios de autenticidad (calidad de costuras, sellado, número de serie visible); consulta Vestiaire Collective, The RealReal, Fashionphile, Rebag y los departamentos de bolsos de Christie's/Sotheby's. Para MINERALES Y ROCAS (categoría minerals) identifica especie mineral, hábito cristalino, color y transparencia, procedencia probable del yacimiento y tamaño estimado; consulta Mindat.org, MineralAuctions, eBay sold listings y Catawiki. Para GEMAS Y PIEDRAS PRECIOSAS SUELTAS (categoría gemstones) identifica tipo de gema, corte, color, transparencia y posible origen; el peso en quilates es determinante y si no es visible indícalo como limitación; consulta Opal Auctions (para ópalos), GemVal, GIA (Gemological Institute of America), eBay sold listings y Catawiki.

PAÍS VASCO — mercado de alto precio: no uses medias nacionales ni provinciales para una microzona prime. Si el contexto identifica estas zonas, usa como referencia orientativa: Neguri y primera línea de Getxo 7.500-10.000 €/m² (objetivo base de lujo 8.000 €/m²); Las Arenas/Areeta y Algorta prime 6.000-8.500 €/m²; Bilbao Abandoibarra 6.500-9.000 €/m², Ensanche/Abando e Indautxu prime 5.500-8.000 €/m²; San Sebastián Centro, Área Romántica, Miraconcha y Ondarreta 8.000-12.000 €/m², con producto excepcional por encima; Zarautz y Hondarribia prime 6.000-9.000 €/m²; Vitoria centro prime 4.000-6.000 €/m². Para municipios o barrios no listados elige comparables de la microzona, no traslades automáticamente los precios prime. Añade 15-40 % por vistas al mar, terraza, ático, parcela, edificio singular, gran superficie o reforma integral de lujo. No apliques descuentos genéricos después de usar un precio/m² ya ajustado al estado. NO redondees el precio por m²: exprésalo con el valor exacto que hayas aplicado (por ejemplo, 8.125 €/m², no 8.000 €/m²) y usa ese valor exacto en la multiplicación por la superficie. Ejemplo vinculante: 200 m² de lujo en Neguri a 8.000 €/m² parten de 1.600.000 €, antes de primas; nunca deben terminar por debajo por una suposición visual contradictoria. Para otras zonas prime: Barrio de Salamanca/Chamberí 7.000-12.000 €/m², La Moraleja/Puerta de Hierro 5.500-9.000 €/m², Pedralbes/Sarrià/Eixample Dreta 6.000-10.000 €/m², Marbella Milla de Oro/Puerto Banús 6.000-12.000 €/m² e Ibiza/Mallorca prime 7.000-12.000 €/m². Si no hay acceso a anuncios en vivo, presenta las referencias como orientativas, no como consultas realizadas. Responde SIEMPRE en español.`;

const systemEn = `You are an expert appraiser who consults public databases worldwide (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analyze the photos and return an honest valuation with realistic EUR and USD ranges. If identification is uncertain, use "low" confidence and zero prices rather than inventing a value. For collectible cards, precisely identify every possible edition using expansion symbol, collector number, year, language, border, foil status and condition, consulting Scryfall, MTGGoldfish, TCGPlayer, Cardmarket or PriceCharting as appropriate. For MOTOR VEHICLES (category vehicles: cars, motorcycles, historic vehicles, vans, light trucks, etc.) identify make, model, approximate generation, engine, apparent mileage and visual condition. Reference eBay sold listings, Mobile.de, Autoscout24, Classic.com, Bring a Trailer and Hemmings; adjust for European (EUR) and US (USD) markets. For WATERCRAFT (category boats: yachts, sailboats, motorboats, fishing boats, jet skis, RIBs, etc.) identify type, approximate length, hull and engine make/model, age, condition and visible equipment. Reference YachtWorld, Boat Trader, Annonces du Bateau, TopBoats and Band of Boats; prices vary greatly by country, season and condition. For REAL ESTATE, never apply artificial ceilings: ALWAYS calculate area × the micro-location's price per m² first, then adjust for condition and uniqueness. User-provided location, area and property type override visual guesses; never reduce a stated area. If area is absent, use a coherent area interval and calculate both endpoints. For luxury property cite indicative comparables from Idealista, Fotocasa, Sotheby's Realty, Christie's Real Estate and Engel & Völkers, do not cap at EUR 1,000,000, and show area, EUR/m² range, premiums and final calculation in notes. For BONSAI (category bonsai) identify species, style (chokkan, moyogi, kengai, forest, etc.), approximate age from trunk girth and nebari, ramification quality and visible health; note if the pot is by a recognised potter (Tokoname, Yixing) and value it separately if significant. Reference Bonsai Empire, specialised nurseries/auctions and eBay sold listings; prices range from EUR 20-30 for starter material to several thousand for mature styled specimens. For WINE & SPIRITS (category wine) identify producer, appellation/region, vintage, bottle format and condition (fill level, label, capsule, cork); reference Wine-Searcher, iDealwine, Vinfolio and auction houses such as Sotheby's/Christie's Wine or Whisky Auctioneer for spirits. For ANTIQUE FURNITURE (category furniture) identify style and period (e.g. Louis XV, Art Deco, mid-century), material, possible maker/workshop marks, and condition/restorations; reference Catawiki, 1stDibs, Invaluable and Christie's/Sotheby's furniture departments. For MILITARIA (category militaria) identify conflict/era, country, unit and item type (medal, insignia, uniform, document), and explicitly flag if it looks like a modern reproduction rather than an original piece, since price varies drastically; reference specialised houses like Hermann Historica, Bonhams Arms & Militaria and eBay sold listings. For LUXURY BAGS & ACCESSORIES (category luxury bags) identify brand, model, line, materials, hardware and possible authenticity cues (stitching quality, stamping, visible serial/date code); reference Vestiaire Collective, The RealReal, Fashionphile, Rebag and Christie's/Sotheby's handbag departments. For MINERALS & ROCKS (category minerals) identify mineral species, crystal habit, colour and transparency, likely locality, and estimated size; reference Mindat.org, MineralAuctions, eBay sold listings and Catawiki. For LOOSE GEMSTONES (category gemstones) identify gem type, cut, colour, transparency and likely origin; carat weight is decisive, and if not visible flag it as a limitation; reference Opal Auctions (for opals), GemVal, GIA (Gemological Institute of America), eBay sold listings and Catawiki.

BASQUE COUNTRY is a high-price market: never substitute national or province-wide averages for a prime micro-location. Indicative ranges when the user's context identifies them: Neguri and Getxo seafront 7,500-10,000 EUR/m² (8,000 EUR/m² luxury baseline); Las Arenas/Areeta and prime Algorta 6,000-8,500; Bilbao Abandoibarra 6,500-9,000, prime Ensanche/Abando and Indautxu 5,500-8,000; San Sebastián Centro, Romantic Area, Miraconcha and Ondarreta 8,000-12,000, with exceptional stock above that; prime Zarautz and Hondarribia 6,000-9,000; prime central Vitoria 4,000-6,000. For unlisted districts use their own micro-location comparables rather than automatically applying prime prices. Add 15-40% for sea views, terrace, penthouse, land, landmark building, large floor area or full luxury renovation. Do not apply a generic discount after choosing an EUR/m² figure already adjusted for condition. DO NOT round the price per m²: state the exact value you apply (for example, 8,125 EUR/m², not 8,000 EUR/m²) and use that exact value when multiplying by the area. Binding example: a 200 m² luxury residence in Neguri at 8,000 EUR/m² starts at EUR 1,600,000 before premiums and must not end below that due to a contradictory visual guess. If live listings are unavailable, clearly label sources as indicative references rather than live queries. Always answer in English.`;

function applyBulkFloor(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null) return parsed;
  const rec = parsed as Record<string, unknown>;
  const lowConfidence = rec.confidence === "low";
  const enforceMinimum = (val: unknown, defaultMin: number): number => {
    const num = toNumberLoose(val);
    if (!isFinite(num) || num < 0) return 0;
    if (lowConfidence) return num;
    return num < defaultMin ? defaultMin : num;
  };
  rec.priceEurMin = enforceMinimum(rec.priceEurMin, 0.02);
  rec.priceEurMax = enforceMinimum(rec.priceEurMax, 0.1);
  rec.priceUsdMin = enforceMinimum(rec.priceUsdMin, 0.02);
  rec.priceUsdMax = enforceMinimum(rec.priceUsdMax, 0.1);
  if ((rec.priceEurMax as number) < (rec.priceEurMin as number)) rec.priceEurMax = rec.priceEurMin;
  if ((rec.priceUsdMax as number) < (rec.priceUsdMin as number)) rec.priceUsdMax = rec.priceUsdMin;
  return rec;
}

export const valuateItem = createServerFn({ method: "POST" })
  .validator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    if (!process.env.XAI_API_KEY && !process.env.LOVABLE_API_KEY) {
      console.error("[valuateItem] Missing XAI_API_KEY and LOVABLE_API_KEY");
      setResponseStatus(500);
      throw new Error("Valuation service misconfigured");
    }

    const { origin, host } = requestOriginHost();
    if (!isAllowedOrigin(origin, host)) {
      setResponseStatus(403);
      throw new Error("Forbidden");
    }

    const ip = clientIp();
    if (!checkGlobal()) {
      setResponseStatus(429);
      throw new Error("Service busy, try again later");
    }
    if (!pruneAndCheck(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      setResponseStatus(429);
      throw new Error("Too many requests");
    }

    try {
      if (isCoinValuation(data.category, data.context)) {
        const spots = await getMetalSpots();
        const id = await identifyCoin(data);
        return await priceCoin(data, id, spots);
      }

      const categoryLine =
        data.category && data.category !== "auto"
          ? data.lang === "es"
            ? `\nCategoría indicada: ${data.category}`
            : `\nStated category: ${data.category}`
          : "";
      const conditionLine =
        data.condition && data.condition !== "unknown"
          ? data.lang === "es"
            ? `\nCondición indicada por el usuario: ${data.condition} (ajusta el precio en consecuencia)`
            : `\nUser-stated condition: ${data.condition} (adjust price accordingly)`
          : "";

      const userPrompt =
        (data.lang === "es"
          ? "Analiza este objeto y devuelve JSON con los campos: title (nombre corto), identification (descripción detallada: tipo, marca/autor probable, época, materiales, estado aparente), priceEurMin, priceEurMax, priceUsdMin, priceUsdMax (números decimales en euros y dólares, ej: 0.05 y 0.10), confidence (low|medium|high), notes (razonamiento y factores que afectan el precio; si las bases de datos mencionadas son solo referencias orientativas y no consultas en vivo, acláralo aquí), sources (array con las bases públicas consultadas conceptualmente, ej: eBay sold listings, Wikipedia, Catawiki...).\n\nContexto del usuario: "
          : "Analyze this item and return JSON with fields: title (short name), identification (detailed description: type, likely brand/maker, era, materials, apparent condition), priceEurMin, priceEurMax, priceUsdMin, priceUsdMax (decimal numbers in euros and dollars, e.g. 0.05 and 0.10), confidence (low|medium|high), notes (reasoning and factors affecting price; clarify here if the mentioned databases are only indicative references rather than live lookups), sources (array with the public databases consulted conceptually, e.g. eBay sold listings, Wikipedia, Catawiki...).\n\nUser context: ") +
        (data.context || "(none)") +
        categoryLine +
        conditionLine;

      const { text } = await chatCompletion({
        messages: [
          { role: "system", content: data.lang === "es" ? systemEs : systemEn },
          { role: "user", content: photoContent(data.photos, userPrompt) },
        ],
        json: true,
        search: true,
        timeoutMs: 60_000,
        maxTokens: 1800,
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setResponseStatus(502);
        throw new Error("Model did not return valid JSON");
      }

      parsed = applyBulkFloor(parsed);
      const parsedResult = ResultSchema.safeParse(parsed);
      if (!parsedResult.success) {
        console.error("[valuateItem] Model output failed schema validation:", parsedResult.error.flatten());
        setResponseStatus(502);
        throw new Error("Valuation service returned an unexpected response");
      }
      let out = parsedResult.data;
      if (
        looksLikeCoinText(
          `${data.category} ${data.context} ${out.title} ${out.identification} ${out.notes}`,
        )
      ) {
        const spots = await getMetalSpots();
        const id = coinIdFromText(
          out.title,
          `${out.identification}\n${out.notes}`,
          out.confidence,
        );
        out = ResultSchema.parse({ ...out, ...applyCoinPriceGuards(out, id, spots, data.lang) });
      }
      return out;
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        setResponseStatus(504);
        throw new Error("Valuation service timed out");
      }
      if (err instanceof Error && err.message.startsWith("Valuation")) throw err;
      console.error("[valuateItem] failed:", err);
      setResponseStatus(502);
      throw new Error("Valuation service unavailable");
    }
  });
