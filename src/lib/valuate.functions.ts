import { createServerFn } from "@tanstack/react-start";
import { getWebRequest } from "@tanstack/react-start/server";
import { z } from "zod";

// Cap each photo dataURL to ~1.5MB base64 (~1.1MB binary) to prevent oversized payloads.
const MAX_PHOTO_CHARS = 1_500_000;

const PhotoSchema = z.object({
  dataUrl: z
    .string()
    .startsWith("data:image/")
    .max(MAX_PHOTO_CHARS, "Photo too large"),
});

const InputSchema = z.object({
  photos: z.array(PhotoSchema).min(2).max(6),
  context: z.string().max(500).optional().default(""),
  lang: z.enum(["es", "en"]).default("es"),
});

const ResultSchema = z.object({
  title: z.string(),
  identification: z.string(),
  priceEurMin: z.number(),
  priceEurMax: z.number(),
  priceUsdMin: z.number(),
  priceUsdMax: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  notes: z.string(),
  sources: z.array(z.string()),
});

// Simple in-memory sliding-window rate limiter (best-effort per isolate).
// Not distributed, but adds meaningful abuse friction on top of origin checks.
const RATE_LIMIT_MAX = 8; // requests
const RATE_LIMIT_WINDOW_MS = 60_000; // per minute
const GLOBAL_MAX = 200; // per minute across all callers per isolate
const rateBuckets = new Map<string, number[]>();
let globalHits: number[] = [];

function pruneAndCheck(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
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

function isAllowedOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  // Same-origin: origin's host must match the request Host header.
  if (host && originHost === host) return true;
  // Allow Lovable preview/published subdomains.
  if (/\.lovable\.app$/.test(originHost) || /\.lovable\.dev$/.test(originHost)) {
    return true;
  }
  // Localhost dev.
  if (/^localhost(:\d+)?$/.test(originHost) || /^127\.0\.0\.1(:\d+)?$/.test(originHost)) {
    return true;
  }
  return false;
}

export const valuateItem = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Origin / host check to block cross-site scripted abuse.
    const request = getWebRequest();
    const origin = request?.headers.get("origin") ?? request?.headers.get("referer") ?? null;
    const host = request?.headers.get("host") ?? null;
    if (!isAllowedOrigin(origin, host)) {
      throw new Response("Forbidden", { status: 403 });
    }

    // Per-IP + global rate limiting (best-effort, per-isolate).
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request?.headers.get("x-real-ip") ??
      "unknown";

    if (!checkGlobal()) {
      throw new Response("Service busy, try again later", { status: 429 });
    }
    if (!pruneAndCheck(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
      throw new Response("Too many requests", { status: 429 });
    }

    const systemEs = `Eres un tasador experto que consulta bases de datos públicas de todo el mundo (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analiza las fotos y devuelve una tasación honesta con rangos de precio realistas en EUR y USD. Si no puedes identificar el objeto con seguridad, indícalo y usa confianza "low". Responde SIEMPRE en español.`;
    const systemEn = `You are an expert appraiser who consults public databases from around the world (eBay sold listings, Wikipedia, Catawiki, WorthPoint, Heritage Auctions, Chrono24, Discogs, etc.). Analyze the photos and return an honest valuation with realistic price ranges in EUR and USD. If you cannot confidently identify the item, say so and use "low" confidence. Always answer in English.`;

    const userPrompt =
      (data.lang === "es"
        ? "Analiza este objeto y devuelve JSON con los campos: title (nombre corto), identification (descripción detallada: tipo, marca/autor probable, época, materiales, estado aparente), priceEurMin, priceEurMax, priceUsdMin, priceUsdMax (números en euros y dólares), confidence (low|medium|high), notes (razonamiento y factores que afectan el precio), sources (array con las bases públicas consultadas conceptualmente, ej: eBay sold listings, Wikipedia, Catawiki...).\n\nContexto del usuario: "
        : "Analyze this item and return JSON with fields: title (short name), identification (detailed description: type, likely brand/maker, era, materials, apparent condition), priceEurMin, priceEurMax, priceUsdMin, priceUsdMax (numbers in euros and dollars), confidence (low|medium|high), notes (reasoning and factors affecting price), sources (array with the public databases consulted conceptually, e.g. eBay sold listings, Wikipedia, Catawiki...).\n\nUser context: ") +
      (data.context || "(none)");

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: userPrompt },
      ...data.photos.map((p) => ({
        type: "image_url",
        image_url: { url: p.dataUrl },
      })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: data.lang === "es" ? systemEs : systemEn },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`AI gateway error [${res.status}]: ${text.slice(0, 500)}`);
      throw new Error("Valuation service unavailable");
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Model did not return valid JSON");
    }
    return ResultSchema.parse(parsed);
  });
