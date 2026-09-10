import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";

const MAX_PHOTO_CHARS = 1_500_000;
const MAX_TOTAL_PHOTO_CHARS = 6_000_000;
const FETCH_TIMEOUT_MS = 30_000;

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
    context: z.string().max(500).optional().default(""),
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
  notes: z.string().max(2000),
  sources: z.array(z.string().max(200)).max(8),
});

// NOTA: rate limiting en memoria — no es global entre instancias/serverless.
// Para producción real, sustituir por Redis/Upstash/KV de la plataforma.
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
    if (fresh.length === 0) {
      rateBuckets.delete(key);
    } else {
      rateBuckets.set(key, fresh);
    }
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

// Allowlist exacta por variable de entorno ALLOWED_ORIGINS (valores separados
// por coma, ej: "https://mi-app.lovable.app,https://mi-dominio.com").
// Evita aceptar cualquier *.lovable.app/*.lovable.dev que no sea tu propia app.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  let originHost: string;
  let originFull: string;
  try {
    const u = new URL(origin);
    originHost = u.host;
    originFull = u.origin;
  } catch {
    return false;
  }
  if (host && originHost === host) return true;
  if (ALLOWED_ORIGINS.includes(originFull)) return true;
  if (
    /(^|\.)lovable\.app$/.test(originHost) ||
    /(^|\.)lovable\.dev$/.test(originHost) ||
    /(^|\.)lovableproject\.com$/.test(originHost)
  ) {
    return true;
  }
  if (/^localhost(:\d+)?$/.test(originHost) || /^127\.0\.0\.1(:\d+)?$/.test(originHost)) {
    return true;
  }
  return false;
}

// Convierte un valor (number o string con formato europeo/anglosajón) a number.
// Maneja correctamente "0,05", "1.234,56", "1,234.56", etc.
// Si el valor contiene caracteres no numéricos (ej. "~0.05", "< 1") que
// impidan el parseo, devuelve NaN — que luego se convierte en 0 por
// enforceMinimum, evitando que un NaN llegue al cliente.
function toNumberLoose(val: unknown): number {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return NaN;
  const cleaned = val.trim();
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma > -1 && lastDot > -1) {
    // Ambos presentes: el que aparece último es el separador decimal.
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Solo coma: se trata como separador decimal (formato europeo).
    normalized = cleaned.replace(",", ".");
  }
  return parseFloat(normalized);
}

export const valuateItem = createServerFn({ method: "POST" })
  .validator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[valuateItem] Missing GEMINI_API_KEY");
      setResponseStatus(500);
      throw new Error("Valuation service misconfigured");
    }

    const request = getRequest();
    const origin = request?.headers.get("origin") ?? request?.headers.get("referer") ?? null;
    const host = request?.headers.get("host") ?? null;
    if (!isAllowedOrigin(origin, host)) {
      setResponseStatus(403);
      throw new Error("Forbidden");
    }

    // cf-connecting-ip solo es fiable detrás de Cloudflare.
    // x-forwarded-for/x-real-ip son spoofeables si no hay un proxy de confianza.
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request?.headers.get("x-real-ip") ??
      "unknown";

    if (!checkGlobal()) {
      setResponseStatus(429);
      throw new Error("Service busy, try again later");
    }
    if (!pruneAndCheck(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      setResponseStatus(429);
      throw new Error("Too many requests");
    }

    const systemEs = `Eres un tasador experto que consulta bases de datos públicas de todo el mundo (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analiza las fotos y devuelve una tasación honesta con rangos de precio realistas en EUR y USD. Si no puedes identificar el objeto con seguridad, indícalo y usa confianza "low", y en ese caso NO inventes un precio: usa 0 en los campos de precio. Para cartas coleccionables (Magic: The Gathering, Pokémon, Yu-Gi-Oh, deportes, etc.) IDENTIFICA CON PRECISIÓN la edición/set exacto usando el símbolo de expansión, el número de colección, el año, el idioma, el borde (blanco/negro), foil/no-foil y el estado (NM/LP/MP/HP/DMG). Consulta referencias específicas (Scryfall, MTGGoldfish, TCGPlayer, Cardmarket para Magic; TCGPlayer/PriceCharting para Pokémon) y considera TODAS las ediciones posibles antes de dar el precio. Si identificas con confianza media o alta una carta u objeto coleccionable común de valor muy bajo (bulk), asigna un rango mínimo de mercado real de céntimos (ej. 0.02 - 0.10 EUR/USD) en vez de 0. Indica en "notes" la edición identificada y menciona alternativas si hay duda. Para VEHÍCULOS A MOTOR (categoría vehicles: coches, motocicletas, vehículos históricos, furgonetas, camiones ligeros, etc.) identifica marca, modelo, generación aproximada, motorización, kilometraje aparente y estado visual. Consulta referencias como eBay sold listings, Mobile.de, Autoscout24, Classic.com, Bring a Trailer y Hemmings; ajusta por mercado europeo (EUR) y estadounidense (USD). Para embarcaciones (categoría boats: yates, veleros, lanchas, barcos de pesca, jet skis, neumáticas, etc.) identifica tipo, eslora aproximada, marca/modelo del casco y motor, antigüedad, estado de conservación y equipamiento visible. Consulta referencias como YachtWorld, Boat Trader, Annonces du Bateau, TopBoats y Band of Boats; ten en cuenta que los precios varían mucho según país, temporada y estado. Para INMUEBLES (categoría realestate: pisos, casas, villas, chalets, locales, terrenos, edificios) NO apliques suelos de céntimos ni techos artificiales: estima el valor de mercado real, que puede ser de cientos de miles a decenas de millones de euros. Calcula SIEMPRE el precio como superficie × precio/m² de la microzona, antes de ajustar por estado y singularidad. El contexto del usuario sobre ubicación, m² y tipología prevalece sobre cualquier inferencia visual; no reduzcas la superficie indicada. Distingue estrictamente un apartamento pequeño de una residencia de 3+ dormitorios, dúplex, planta completa o >150 m². Si faltan m², estima un intervalo de superficie coherente y calcula ambos extremos. Para lujo usa comparables de Idealista, Fotocasa, Sotheby's Realty, Christie's Real Estate y Engel & Völkers; no limites el resultado a 1.000.000 € y explica en "notes" superficie, horquilla €/m², primas y cálculo final. Para BONSÁIS (categoría bonsai) identifica especie, estilo (chokkan, moyogi, kengai, forest, etc.), edad aproximada por grosor de tronco y nebari, calidad de la ramificación y estado de salud visible; ten en cuenta si la maceta es de autor (Tokoname, Yixing) y súmala aparte si es apreciable. Consulta Bonsai Empire, viveros y subastas especializadas, y eBay sold listings; los precios van desde 20-30 € en material de partida hasta varios miles en ejemplares de estilo maduro. Para VINO Y LICORES (categoría wine) identifica productor, denominación de origen o región, añada, formato de botella y estado de conservación (nivel de llenado, etiqueta, cápsula, corcho); consulta Wine-Searcher, iDealwine, Vinfolio y casas como Sotheby's/Christie's Wine o Whisky Auctioneer para licores. Para MUEBLES ANTIGUOS (categoría furniture) identifica estilo y época (Isabelino, Luis XV, Art Déco, medio siglo, etc.), material, posibles marcas de ebanista o taller, y estado/restauraciones; consulta Catawiki, 1stDibs, Invaluable y los departamentos de mobiliario de Christie's/Sotheby's. Para MILITARIA (categoría militaria) identifica conflicto/época, país, unidad y tipo de pieza (medalla, insignia, uniforme, documento), y sé explícito si parece una reproducción moderna en vez de una pieza original, ya que el precio varía drásticamente; consulta Hermann Historica, Bonhams Arms & Militaria y eBay sold listings. Para BOLSOS Y COMPLEMENTOS DE LUJO (categoría luxury bags) identifica marca, modelo, línea, materiales, herrajes y posibles indicios de autenticidad (calidad de costuras, sellado, número de serie visible); consulta Vestiaire Collective, The RealReal, Fashionphile, Rebag y los departamentos de bolsos de Christie's/Sotheby's. Para MINERALES Y ROCAS (categoría minerals) identifica especie mineral, hábito cristalino, color y transparencia, procedencia probable del yacimiento y tamaño estimado; consulta Mindat.org, MineralAuctions, eBay sold listings y Catawiki. Para GEMAS Y PIEDRAS PRECIOSAS SUELTAS (categoría gemstones) identifica tipo de gema, corte, color, transparencia y posible origen; el peso en quilates es determinante y si no es visible indícalo como limitación; consulta Opal Auctions (para ópalos), GemVal, GIA (Gemological Institute of America), eBay sold listings y Catawiki.

PAÍS VASCO — mercado de alto precio: no uses medias nacionales ni provinciales para una microzona prime. Si el contexto identifica estas zonas, usa como referencia orientativa: Neguri y primera línea de Getxo 7.500-10.000 €/m² (objetivo base de lujo 8.000 €/m²); Las Arenas/Areetа y Algorta prime 6.000-8.500 €/m²; Bilbao Abandoibarra 6.500-9.000 €/m², Ensanche/Abando e Indautxu prime 5.500-8.000 €/m²; San Sebastián Centro, Área Romántica, Miraconcha y Ondarreta 8.000-12.000 €/m², con producto excepcional por encima; Zarautz y Hondarribia prime 6.000-9.000 €/m²; Vitoria centro prime 4.000-6.000 €/m². Para municipios o barrios no listados elige comparables de la microzona, no traslades automáticamente los precios prime. Añade 15-40 % por vistas al mar, terraza, ático, parcela, edificio singular, gran superficie o reforma integral de lujo. No apliques descuentos genéricos después de usar un precio/m² ya ajustado al estado. NO redondees el precio por m²: exprésalo con el valor exacto que hayas aplicado (por ejemplo, 8.125 €/m², no 8.000 €/m²) y usa ese valor exacto en la multiplicación por la superficie. Ejemplo vinculante: 200 m² de lujo en Neguri a 8.000 €/m² parten de 1.600.000 €, antes de primas; nunca deben terminar por debajo por una suposición visual contradictoria. Para otras zonas prime: Barrio de Salamanca/Chamberí 7.000-12.000 €/m², La Moraleja/Puerta de Hierro 5.500-9.000 €/m², Pedralbes/Sarrià/Eixample Dreta 6.000-10.000 €/m², Marbella Milla de Oro/Puerto Banús 6.000-12.000 €/m² e Ibiza/Mallorca prime 7.000-12.000 €/m². Si no hay acceso a anuncios en vivo, presenta las referencias como orientativas, no como consultas realizadas. Responde SIEMPRE en español.`;

    const systemEn = `You are an expert appraiser who consults public databases worldwide (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analyze the photos and return an honest valuation with realistic EUR and USD ranges. If identification is uncertain, use "low" confidence and zero prices rather than inventing a value. For collectible cards, precisely identify every possible edition using expansion symbol, collector number, year, language, border, foil status and condition, consulting Scryfall, MTGGoldfish, TCGPlayer, Cardmarket or PriceCharting as appropriate. For MOTOR VEHICLES (category vehicles: cars, motorcycles, historic vehicles, vans, light trucks, etc.) identify make, model, approximate generation, engine, apparent mileage and visual condition. Reference eBay sold listings, Mobile.de, Autoscout24, Classic.com, Bring a Trailer and Hemmings; adjust for European (EUR) and US (USD) markets. For WATERCRAFT (category boats: yachts, sailboats, motorboats, fishing boats, jet skis, RIBs, etc.) identify type, approximate length, hull and engine make/model, age, condition and visible equipment. Reference YachtWorld, Boat Trader, Annonces du Bateau, TopBoats and Band of Boats; prices vary greatly by country, season and condition. For REAL ESTATE, never apply artificial ceilings: ALWAYS calculate area × the micro-location's price per m² first, then adjust for condition and uniqueness. User-provided location, area and property type override visual guesses; never reduce a stated area. If area is absent, use a coherent area interval and calculate both endpoints. For luxury property cite indicative comparables from Idealista, Fotocasa, Sotheby's Realty, Christie's Real Estate and Engel & Völkers, do not cap at EUR 1,000,000, and show area, EUR/m² range, premiums and final calculation in notes. For BONSAI (category bonsai) identify species, style (chokkan, moyogi, kengai, forest, etc.), approximate age from trunk girth and nebari, ramification quality and visible health; note if the pot is by a recognised potter (Tokoname, Yixing) and value it separately if significant. Reference Bonsai Empire, specialised nurseries/auctions and eBay sold listings; prices range from EUR 20-30 for starter material to several thousand for mature styled specimens. For WINE & SPIRITS (category wine) identify producer, appellation/region, vintage, bottle format and condition (fill level, label, capsule, cork); reference Wine-Searcher, iDealwine, Vinfolio and auction houses such as Sotheby's/Christie's Wine or Whisky Auctioneer for spirits. For ANTIQUE FURNITURE (category furniture) identify style and period (e.g. Louis XV, Art Deco, mid-century), material, possible maker/workshop marks, and condition/restorations; reference Catawiki, 1stDibs, Invaluable and Christie's/Sotheby's furniture departments. For MILITARIA (category militaria) identify conflict/era, country, unit and item type (medal, insignia, uniform, document), and explicitly flag if it looks like a modern reproduction rather than an original piece, since price varies drastically; reference specialised houses like Hermann Historica, Bonhams Arms & Militaria and eBay sold listings. For LUXURY BAGS & ACCESSORIES (category luxury bags) identify brand, model, line, materials, hardware and possible authenticity cues (stitching quality, stamping, visible serial/date code); reference Vestiaire Collective, The RealReal, Fashionphile, Rebag and Christie's/Sotheby's handbag departments. For MINERALS & ROCKS (category minerals) identify mineral species, crystal habit, colour and transparency, likely locality, and estimated size; reference Mindat.org, MineralAuctions, eBay sold listings and Catawiki. For LOOSE GEMSTONES (category gemstones) identify gem type, cut, colour, transparency and likely origin; carat weight is decisive, and if not visible flag it as a limitation; reference Opal Auctions (for opals), GemVal, GIA (Gemological Institute of America), eBay sold listings and Catawiki.

BASQUE COUNTRY is a high-price market: never substitute national or province-wide averages for a prime micro-location. Indicative ranges when the user's context identifies them: Neguri and Getxo seafront 7,500-10,000 EUR/m² (8,000 EUR/m² luxury baseline); Las Arenas/Areeta and prime Algorta 6,000-8,500; Bilbao Abandoibarra 6,500-9,000, prime Ensanche/Abando and Indautxu 5,500-8,000; San Sebastián Centro, Romantic Area, Miraconcha and Ondarreta 8,000-12,000, with exceptional stock above that; prime Zarautz and Hondarribia 6,000-9,000; prime central Vitoria 4,000-6,000. For unlisted districts use their own micro-location comparables rather than automatically applying prime prices. Add 15-40% for sea views, terrace, penthouse, land, landmark building, large floor area or full luxury renovation. Do not apply a generic discount after choosing an EUR/m² figure already adjusted for condition. DO NOT round the price per m²: state the exact value you apply (for example, 8,125 EUR/m², not 8,000 EUR/m²) and use that exact value when multiplying by the area. Binding example: a 200 m² luxury residence in Neguri at 8,000 EUR/m² starts at EUR 1,600,000 before premiums and must not end below that due to a contradictory visual guess. If live listings are unavailable, clearly label sources as indicative references rather than live queries. Always answer in English.`;

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

    /** Separa una data URL ("data:image/jpeg;base64,AAAA...") en mimeType + base64 puro,
     * que es el formato que exige la API nativa de Gemini (inlineData). */
    function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
      const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
      if (!match) throw new Error("Invalid photo data URL");
      return { mimeType: match[1], data: match[2] };
    }

    const parts: Array<Record<string, unknown>> = [
      { text: userPrompt },
      ...data.photos.map((p) => ({ inlineData: parseDataUrl(p.dataUrl) })),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            systemInstruction: {
              parts: [{ text: data.lang === "es" ? systemEs : systemEn }],
            },
            // Búsqueda real en Google Search: el modelo consulta internet de verdad
            // antes de responder, en vez de generar precios solo de memoria.
            // NOTA: no forzamos responseMimeType "application/json" aquí porque en
            // varias versiones de Gemini eso da error 400 ("Tool use with a response
            // mime type: 'application/json' is unsupported") al combinarlo con
            // google_search. En su lugar, el prompt ya pide "SOLO JSON" y abajo se
            // extrae el JSON de forma tolerante por si el modelo añade texto de más.
            tools: [{ googleSearch: {} }],
          }),
          signal: controller.signal,
        },
      );
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(`[valuateItem] Gemini fetch failed: ${isAbort ? "timeout" : String(err)}`);
      setResponseStatus(isAbort ? 504 : 502);
      throw new Error(isAbort ? "Valuation service timed out" : "Valuation service unavailable");
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[valuateItem] Gemini API error [${res.status}]: ${text.slice(0, 500)}`);
      setResponseStatus(502);
      throw new Error("Valuation service unavailable");
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const rawText = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";

    /** El modelo, con google_search activo, a veces añade texto o backticks
     * alrededor del JSON pese a que el prompt pide "SOLO JSON". Extrae el primer
     * bloque {...} válido en vez de asumir que la respuesta es JSON puro. */
    function extractJson(text: string): string {
      const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
      if (fenced) return fenced[1].trim();
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
      return text.trim();
    }

    const raw = extractJson(rawText) || "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setResponseStatus(502);
      throw new Error("Model did not return valid JSON");
    }

    // --- Protección de precio mínimo ---
    // Solo se aplica el suelo de céntimos cuando confidence es medium o high.
    // Con confidence "low" no inflamos el precio: mejor mostrar 0 que inventar
    // una tasación. NaN y valores negativos se convierten siempre a 0.
    if (typeof parsed === "object" && parsed !== null) {
      const rec = parsed as Record<string, unknown>;
      const lowConfidence = rec.confidence === "low";

      const enforceMinimum = (val: unknown, defaultMin: number): number => {
        const num = toNumberLoose(val);
        // NaN, Infinity, negativo → 0 (sin inventar precio)
        if (!isFinite(num) || num < 0) return 0;
        // Confianza baja → devolver tal cual, sin suelo artificial
        if (lowConfidence) return num;
        // Confianza media/alta → aplicar suelo de mercado bulk
        return num < defaultMin ? defaultMin : num;
      };

      rec.priceEurMin = enforceMinimum(rec.priceEurMin, 0.02);
      rec.priceEurMax = enforceMinimum(rec.priceEurMax, 0.1);
      rec.priceUsdMin = enforceMinimum(rec.priceUsdMin, 0.02);
      rec.priceUsdMax = enforceMinimum(rec.priceUsdMax, 0.1);

      // Garantiza que max >= min tras aplicar los suelos
      if ((rec.priceEurMax as number) < (rec.priceEurMin as number))
        rec.priceEurMax = rec.priceEurMin;
      if ((rec.priceUsdMax as number) < (rec.priceUsdMin as number))
        rec.priceUsdMax = rec.priceUsdMin;
    }

    // safeParse en vez de parse: el error lo controlamos nosotros,
    // con log detallado en servidor y mensaje genérico al cliente.
    const result = ResultSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[valuateItem] Model output failed schema validation:", result.error.flatten());
      setResponseStatus(502);
      throw new Error("Valuation service returned an unexpected response");
    }

    return result.data;
  });
