import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const MAX_PHOTO_CHARS = 1_500_000;

const CATEGORY_KEYS = [
  "art",
  "cards",
  "coins",
  "stamps",
  "watches",
  "jewelry",
  "electronics",
  "books",
  "toys",
  "vinyl",
  "fashion",
  "sports",
  "other",
] as const;

const InputSchema = z.object({
  dataUrl: z.string().startsWith("data:image/").max(MAX_PHOTO_CHARS),
  lang: z.enum(["es", "en"]).default("es"),
});

const OutputSchema = z.object({
  category: z.enum(CATEGORY_KEYS),
  confidence: z.enum(["low", "medium", "high"]),
});

// Reuse a lightweight rate limit (per isolate, best-effort).
const buckets = new Map<string, number[]>();
const WINDOW = 60_000;
const MAX_PER_IP = 20;

function allowed(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (arr.length >= MAX_PER_IP) {
    buckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  buckets.set(ip, arr);
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
  if (host && originHost === host) return true;
  if (/\.lovable\.app$/.test(originHost) || /\.lovable\.dev$/.test(originHost)) return true;
  if (/^localhost(:\d+)?$/.test(originHost) || /^127\.0\.0\.1(:\d+)?$/.test(originHost)) return true;
  return false;
}

export const detectCategory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const request = getRequest();
    const origin = request?.headers.get("origin") ?? request?.headers.get("referer") ?? null;
    const host = request?.headers.get("host") ?? null;
    if (!isAllowedOrigin(origin, host)) {
      throw new Response("Forbidden", { status: 403 });
    }
    const ip =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request?.headers.get("x-real-ip") ??
      "unknown";
    if (!allowed(ip)) {
      throw new Response("Too many requests", { status: 429 });
    }

    const system =
      data.lang === "es"
        ? `Eres un clasificador experto. Mira la foto y elige la categoría más probable del objeto de esta lista EXACTA (usa la clave en inglés): art, cards, coins, stamps, watches, jewelry, electronics, books, toys, vinyl, fashion, sports, other. Devuelve SOLO JSON: {"category":"<clave>","confidence":"low|medium|high"}.`
        : `You are an expert classifier. Look at the photo and pick the most likely item category from this EXACT list (use the English key): art, cards, coins, stamps, watches, jewelry, electronics, books, toys, vinyl, fashion, sports, other. Return ONLY JSON: {"category":"<key>","confidence":"low|medium|high"}.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: data.lang === "es" ? "Clasifica este objeto." : "Classify this item." },
              { type: "image_url", image_url: { url: data.dataUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`AI gateway error [${res.status}]: ${text.slice(0, 300)}`);
      throw new Error("Detection unavailable");
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Model did not return valid JSON");
    }
    return OutputSchema.parse(parsed);
  });
