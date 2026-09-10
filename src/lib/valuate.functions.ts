export type ConfidenceLevel = "high" | "medium" | "low";

export interface ValuateOptions {
  photos: string[];
  category?: string;
  condition?: string;
  context?: string;
  lang?: "es" | "en";
}

export interface AppraisalResult {
  identification: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  confidence: ConfidenceLevel;
  sources: { title: string; url: string }[];
  notes: string;
}

function formatInlineData(base64String: string) {
  let mimeType = "image/jpeg";
  let data = base64String;

  const match = base64String.match(/^data:(image\/\w+);base64,(.*)$/);
  if (match) {
    mimeType = match[1];
    data = match[2];
  }

  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

/**
 * Llamada REST a la API de Gemini con sintaxis camelCase correcta y fallback de seguridad
 */
async function callGeminiRestApi(contents: any[], systemInstructionText?: string) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Falta configurar la clave VITE_GEMINI_API_KEY en el entorno.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const buildPayload = (enableSearch: boolean) => {
    const payload: any = {
      contents: [{ parts: contents }],
    };
    if (enableSearch) {
      payload.tools = [{ googleSearch: {} }]; // Sintaxis correcta para REST JSON
    }
    if (systemInstructionText) {
      payload.systemInstruction = { parts: [{ text: systemInstructionText }] };
    }
    return payload;
  };

  // 1. Intento principal con búsqueda web activa
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(true)),
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (err) {
    console.warn("Fallo en la búsqueda web, ejecutando consulta directa de respaldo...", err);
  }

  // 2. Reintento de seguridad sin herramientas si la búsqueda falla
  const fallbackResponse = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildPayload(false)),
  });

  if (!fallbackResponse.ok) {
    const errorText = await fallbackResponse.text();
    console.error("Error en respuesta de Gemini API:", errorText);
    throw new Error(`Error API ${fallbackResponse.status}`);
  }

  return await fallbackResponse.json();
}

/**
 * Tasación numismática y comercial
 */
export async function valuateItem(options: ValuateOptions): Promise<AppraisalResult> {
  const { photos, category = "auto", condition = "unknown", context = "", lang = "es" } = options;

  try {
    const imageParts = (photos || []).map(formatInlineData);

    const promptText = `
Analiza la(s) imagen(es) adjunta(s) y realiza una tasación numismática y comercial profesional:
- Categoría: ${category}
- Condición: ${condition}
- Contexto adicional: ${context || "Moneda / Coleccionismo"}
- Idioma de respuesta: ${lang === "es" ? "Español" : "Inglés"}

REGLAS DE VALORACIÓN REAL DE MERCADO:
1. Identifica la pieza con exactitud (ejemplo: Moneda de oro de 100 Francos Suiza / Vreneli / Helvetia).
2. Evalúa su VALOR REAL DE MERCADO FINAL de coleccionismo y numismática (compras/ventas finales en subastas, casas numismáticas y tiendas especializadas).
3. Para piezas de oro graduadas o certificadas en cápsula (NGC, PCGS), suma la prima de conservación y autenticidad al valor del metal.
4. Responde ÚNICAMENTE con un objeto JSON dentro de un bloque de código \`\`\`json con esta estructura:
{
  "identification": "Nombre exacto de la moneda/objeto, año y detalles de certificación",
  "priceMin": 3000,
  "priceMax": 4500,
  "currency": "EUR",
  "confidence": "high",
  "notes": "Detalles sobre valor del oro SPOT, prima numismática, estado graduado y referencias de subastas reales."
}
`;

    const systemInstruction =
      "Eres un experto numismático y perito tasador internacional. Tasas monedas y objetos raros a su valor comercial real sin infravalorarlos.";

    const contents = [...imageParts, { text: promptText }];
    const apiResult = await callGeminiRestApi(contents, systemInstruction);

    const rawText = apiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const groundingChunks = apiResult?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const extractedSources = groundingChunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web?.title || "Referencia numismática pública",
        url: chunk.web?.uri || "",
      }));

    const parsedData = parseGeminiJsonResponse(rawText);

    const priceMin = Math.max(0, parsedData.priceMin || 0);
    const priceMax = Math.max(priceMin, parsedData.priceMax || priceMin);

    return {
      identification: parsedData.identification || (lang === "es" ? "Pieza analizada" : "Analyzed item"),
      priceMin,
      priceMax,
      currency: parsedData.currency || "EUR",
      confidence: validateConfidence(parsedData.confidence),
      sources: extractedSources.length > 0 ? extractedSources : [{ title: "Catálogos de subastas y numismática", url: "https://google.com" }],
      notes: parsedData.notes || rawText,
    };
  } catch (error) {
    console.error("Error al ejecutar valuateItem:", error);
    throw new Error("No se pudo completar la tasación. Inténtalo de nuevo.");
  }
}

/**
 * Detección de categorías
 */
export async function detectCategoryFromPhotos(photos: string[]): Promise<string> {
  if (!photos || photos.length === 0) return "auto";

  try {
    const imageParts = photos.map(formatInlineData);
    const promptText = `Identifica la categoría del objeto de las fotos de entre estas opciones:
[art, cards, coins, stamps, watches, jewelry, electronics, books, music instrument, toys, vinyl, fashion, sports, memorabilia, bonsai, wine, furniture, militaria, luxury bags, minerals, gemstones, vehicles, boats, realestate, other]

Responde ÚNICAMENTE con la clave exacta.`;

    const contents = [...imageParts, { text: promptText }];
    const apiResult = await callGeminiRestApi(contents);
    const rawText = apiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return rawText.trim().toLowerCase().replace(/[^a-z_]/g, "") || "coins";
  } catch (err) {
    return "coins";
  }
}

function parseGeminiJsonResponse(rawText: string): any {
  try {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : rawText;
    return JSON.parse(jsonString);
  } catch (e) {
    return {
      identification: "Moneda de colección",
      priceMin: 0,
      priceMax: 0,
      currency: "EUR",
      confidence: "medium",
      notes: rawText,
    };
  }
}

function validateConfidence(conf: string): ConfidenceLevel {
  const normalized = (conf || "").toLowerCase();
  if (normalized === "high" || normalized === "alta") return "high";
  if (normalized === "low" || normalized === "baja") return "low";
  return "medium";
}
