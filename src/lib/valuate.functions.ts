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
    photos: z.array(PhotoSchema).min(2).max(6),
    context: z.string().max(500).optional().default(""),
    category: z.string().max(50).optional().default("auto"),
    condition: z.string().max(30).optional().default("unknown"),
    lang: z.enum(["es", "en"]).default("es"),
  })
  .refine(
    (val) =>
      val.photos.reduce((sum, p) => sum + p.dataUrl.length, 0) <=
      MAX_TOTAL_PHOTO_CHARS,
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
  if (
    /^localhost(:\d+)?$/.test(originHost) ||
    /^127\.0\.0\.1(:\d+)?$/.test(originHost)
  ) {
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
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error("[valuateItem] Missing LOVABLE_API_KEY");
      setResponseStatus(500);
      throw new Error("Valuation service misconfigured");
    }

    const request = getRequest();
    const origin =
      request?.headers.get("origin") ??
      request?.headers.get("referer") ??
      null;
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

    const systemEs = `Eres un tasador experto que consulta bases de datos públicas de todo el mundo (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analiza las fotos y devuelve una tasación honesta con rangos de precio realistas en EUR y USD. Si no puedes identificar el objeto con seguridad, indícalo y usa confianza "low", y en ese caso NO inventes un precio: usa 0 en los campos de precio. Para cartas coleccionables (Magic: The Gathering, Pokémon, Yu-Gi-Oh, deportes, etc.) IDENTIFICA CON PRECISIÓN la edición/set exacto usando el símbolo de expansión, el número de colección, el año, el idioma, el borde (blanco/negro), foil/no-foil y el estado (NM/LP/MP/HP/DMG). Consulta referencias específicas (Scryfall, MTGGoldfish, TCGPlayer, Cardmarket para Magic; TCGPlayer/PriceCharting para Pokémon) y considera TODAS las ediciones posibles antes de dar el precio. Si identificas con confianza media o alta una carta u objeto coleccionable común de valor muy bajo (bulk), asigna un rango mínimo de mercado real de céntimos (ej. 0.02 - 0.10 EUR/USD) en vez de 0. Indica en "notes" la edición identificada y menciona alternativas si hay duda. Para INMUEBLES (categoría realestate: pisos, casas, villas, chalets, locales, terrenos, edificios) NO apliques suelos de céntimos ni techos artificiales: estima el valor de mercado real, que puede ser de cientos de miles a decenas de millones de euros. Deduce de las fotos la tipología, superficie aproximada en m², número de estancias, calidad de acabados, vistas, piscina/jardín y ubicación probable; calcula el precio como m² estimados × precio/m² de la zona y ajusta por estado y singularidad. Distingue estrictamente entre la escala de un 'apartamento' (espacio reducido/1-2 dormitorios) y un 'piso/residencia de lujo de gran superficie' (3+ dormitorios, dúplex, planta entera, >150 m²). Da máxima prioridad al contexto del usuario si indica m² o tipología para no infradimensionar propiedades de gran tamaño. Si el inmueble es de lujo (villa, ático, finca, propiedad frente al mar) usa referencias de alta gama (Idealista, Fotocasa, Sotheby's Realty, Christie's Real Estate, Engel & Völkers, Zillow, Realtor.com) y NO limites el resultado a 1.000.000 €: da rangos amplios coherentes (p. ej. 2.500.000 - 4.000.000 €) e indica en "notes" los m² y el precio/m² usados. MUY IMPORTANTE (zonas prime): si el usuario o las fotos indican una zona residencial prime de España, usa el precio/m² real de esa zona y NUNCA por debajo de él: Neguri/Getxo-Areeta 6.500-9.000 €/m² (lujo ~8.000 €/m²), Barrio de Salamanca y Chamberí (Madrid) 7.000-12.000 €/m², La Moraleja/Puerta de Hierro 5.500-9.000 €/m², Pedralbes/Sarrià y Eixample Dreta (Barcelona) 6.000-10.000 €/m², San Sebastián centro/Ondarreta 7.000-10.000 €/m², Marbella Milla de Oro/Puerto Banús 6.000-12.000 €/m², Ibiza/Mallorca prime 7.000-12.000 €/m², Zona centro Bilbao (Abandoibarra, Indautxu) 5.000-7.500 €/m². Aplica una prima adicional del 15-40 % por acabados de lujo, vistas al mar, ático/planta principal, edificio señorial o reforma integral. Si dudas entre dos precios/m², escoge el superior para la zona prime y explica el cálculo (m² × €/m²) en "notes". Responde SIEMPRE en español.`;

const systemEn = `You are an expert appraiser who consults public databases from around the world (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analyze the photos and return an honest valuation with realistic price ranges in EUR and USD. If you cannot confidently identify the item, say so, use "low" confidence, and in that case do NOT invent a price: use 0 for the price fields. For collectible cards (Magic: The Gathering, Pokémon, Yu-Gi-Oh, sports, etc.) PRECISELY IDENTIFY the exact edition/set using the expansion symbol, collector number, year, language, border (white/black), foil/non-foil and condition (NM/LP/MP/HP/DMG). Consult specific references (Scryfall, MTGGoldfish, TCGPlayer, Cardmarket for Magic; TCGPlayer/PriceCharting for Pokémon) and consider ALL possible editions before pricing. If you confidently identify (medium or high confidence) a common collectible card or item of very low value (bulk), assign a real market minimum range of cents (e.g. 0.02 - 0.10 EUR/USD) instead of 0. State the identified edition in "notes" and mention alternatives if uncertain. For REAL ESTATE (realestate category: apartments, houses, villas, commercial units, land, buildings) do NOT apply cent floors or artificial ceilings: estimate the real market value, which can range from hundreds of thousands to tens of millions of euros. Infer from the photos the property type, approximate size in m², number of rooms, finish quality, views, pool/garden and likely location; compute the price as estimated m² × local price per m², adjusting for condition and uniqueness. Strictly distinguish between the scale of a 'compact apartment' (1-2 bedrooms) and a 'large-scale luxury residence/flat' (3+ bedrooms, duplex, full floor, >150 m²). Give maximum priority to user context if specified to avoid underestimating large properties. For luxury property (villa, penthouse, estate, beachfront) use high-end references (Idealista, Fotocasa, Sotheby's Realty, Christie's Real Estate, Engel & Völkers, Zillow, Realtor.com) and do NOT cap the result at 1,000,000 EUR: give wide coherent ranges (e.g. 2,500,000 - 4,000,000 EUR) and state in "notes" the m² and price per m² used. VERY IMPORTANT (prime areas): if the user or photos indicate a prime Spanish residential area, use that area's real price per m² and NEVER go below it: Neguri/Getxo-Areeta 6,500-9,000 EUR/m² (luxury ~8,000 EUR/m²), Barrio de Salamanca and Chamberí (Madrid) 7,000-12,000 EUR/m², La Moraleja/Puerta de Hierro 5,500-9,000 EUR/m², Pedralbes/Sarrià and Eixample Dreta (Barcelona) 6,000-10,000 EUR/m², San Sebastián centre/Ondarreta 7,000-10,000 EUR/m², Marbella Golden Mile/Puerto Banús 6,000-12,000 EUR/m², prime Ibiza/Mallorca 7,000-12,000 EUR/m², central Bilbao (Abandoibarra, Indautxu) 5,000-7,500 EUR/m². Add a 15-40% premium for luxury finishes, sea views, penthouse/main floor, stately building or full renovation. If torn between two price-per-m² figures, pick the higher one for prime areas and explain the calculation (m² × EUR/m²) in "notes". Always answer in English.`;

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

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: userPrompt },
      ...data.photos.map((p) => ({
        type: "image_url",
        image_url: { url: p.dataUrl },
      })),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: data.lang === "es" ? systemEs : systemEn,
            },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(
        `[valuateItem] Gateway fetch failed: ${isAbort ? "timeout" : String(err)}`,
      );
      setResponseStatus(isAbort ? 504 : 502);
      throw new Error(
        isAbort ? "Valuation service timed out" : "Valuation service unavailable",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(
        `[valuateItem] AI gateway error [${res.status}]: ${text.slice(0, 500)}`,
      );
      setResponseStatus(502);
      throw new Error("Valuation service unavailable");
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";

    let parsed: any;
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
      const lowConfidence = parsed.confidence === "low";

      const enforceMinimum = (val: any, defaultMin: number): number => {
        const num = toNumberLoose(val);
        // NaN, Infinity, negativo → 0 (sin inventar precio)
        if (!isFinite(num) || num < 0) return 0;
        // Confianza baja → devolver tal cual, sin suelo artificial
        if (lowConfidence) return num;
        // Confianza media/alta → aplicar suelo de mercado bulk
        return num < defaultMin ? defaultMin : num;
      };

      parsed.priceEurMin = enforceMinimum(parsed.priceEurMin, 0.02);
      parsed.priceEurMax = enforceMinimum(parsed.priceEurMax, 0.10);
      parsed.priceUsdMin = enforceMinimum(parsed.priceUsdMin, 0.02);
      parsed.priceUsdMax = enforceMinimum(parsed.priceUsdMax, 0.10);

      // Garantiza que max >= min tras aplicar los suelos
      if (parsed.priceEurMax < parsed.priceEurMin)
        parsed.priceEurMax = parsed.priceEurMin;
      if (parsed.priceUsdMax < parsed.priceUsdMin)
        parsed.priceUsdMax = parsed.priceUsdMin;
    }

    // safeParse en vez de parse: el error lo controlamos nosotros,
    // con log detallado en servidor y mensaje genérico al cliente.
    const result = ResultSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        "[valuateItem] Model output failed schema validation:",
        result.error.flatten(),
      );
      setResponseStatus(502);
      throw new Error("Valuation service returned an unexpected response");
    }

    return result.data;
  });
