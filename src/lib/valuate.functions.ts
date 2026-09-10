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

/**
 * Limpia y convierte imágenes base64 al formato exacto requerido por Gemini REST API
 */
function formatInlineData(base64String: string) {
  if (!base64String || typeof base64String !== "string") return null;

  let mimeType = "image/jpeg";
  let data = base64String.trim();

  // Extraer tipo MIME y limpiar el prefijo data:image/...;base64,
  if (data.includes(",")) {
    const parts = data.split(",");
    const header = parts[0];
    data = parts.slice(1).join(",");

    const mimeMatch = header.match(/data:(image\/[a-zA-Z0-9.-]+);/);
    if (mimeMatch) {
      mimeType = mimeMatch[1];
    }
  }

  // Eliminar espacios y saltos de línea del cuerpo base64
  data = data.replace(/[\r\n\s]/g, "");

  if (!data) return null;

  return {
    inlineData: {
      mimeType,
      data,
    },
  };
}

/**
 * Llamada HTTP directa a la API REST de Gemini (v1beta)
 */
async function callGeminiRestApi(contents: any[], systemInstructionText?: string) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Falta configurar VITE_GEMINI_API_KEY en las variables de entorno.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const bodyPayload: any = {
    contents: [
      {
        parts: contents,
      },
    ],
  };

  if (systemInstructionText) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstructionText }],
    };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => null);
    const apiErrorDetails = errorJson?.error?.message || `Error HTTP ${response.status}: ${response.statusText}`;
    console.error("Detalles del error devuelto por Gemini API:", errorJson || apiErrorDetails);
    throw new Error(`Gemini API: ${apiErrorDetails}`);
  }

  return await response.json();
}

/**
 * Tasación numismática y comercial de objetos
 */
export async function valuateItem(options: ValuateOptions): Promise<AppraisalResult> {
  const { photos, category = "auto", condition = "unknown", context = "", lang = "es" } = options;

  try {
    const imageParts = (photos || [])
      .map(formatInlineData)
      .filter((part): part is NonNullable<typeof part> => part !== null);

    if (imageParts.length === 0 && photos && photos.length > 0) {
      throw new Error("No se pudo procesar el formato de las imágenes.");
    }

    const promptText = `
Analiza la(s) imagen(es) adjunta(s) y realiza una tasación numismática y comercial profesional:
- Categoría: ${category}
- Condición: ${condition}
- Contexto adicional: ${context || "Moneda / Coleccionismo"}
- Idioma de respuesta: ${lang === "es" ? "Español" : "Inglés"}

REGLAS DE VALORACIÓN REAL DE MERCADO:
1. Identifica la pieza con exactitud (ejemplo: Moneda de oro de 100 Francos Suiza / Vreneli / Helvetia).
2. Evalúa su VALOR REAL DE MERCADO FINAL de coleccionismo y numismática (compras/ventas finales en subastas y tiendas especializadas).
3. Para piezas graduadas/encapsuladas (NGC, PCGS), suma la prima de conservación y autenticidad al valor del metal.
4. Responde ÚNICAMENTE con un objeto JSON dentro de un bloque de código \`\`\`json con esta estructura exacta:
{
  "identification": "Nombre exacto de la moneda/objeto, año y detalles de certificación",
  "priceMin": 3000,
  "priceMax": 4500,
  "currency": "EUR",
  "confidence": "high",
  "notes": "Detalles sobre valor del oro SPOT, prima numismática, estado graduado y referencias de mercado."
}
`;

    const systemInstruction =
      "Eres un experto numismático y perito tasador internacional. Tasas monedas y objetos de colección a su valor comercial real de mercado.";

    const contents = [...imageParts, { text: promptText }];
    const apiResult = await callGeminiRestApi(contents, systemInstruction);

    const rawText = apiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const parsedData = parseGeminiJsonResponse(rawText);

    const priceMin = Math.max(0, parsedData.priceMin || 0);
    const priceMax = Math.max(priceMin, parsedData.priceMax || priceMin);

    return {
      identification: parsedData.identification || (lang === "es" ? "Pieza analizada" : "Analyzed item"),
      priceMin,
      priceMax,
      currency: parsedData.currency || "EUR",
      confidence: validateConfidence(parsedData.confidence),
      sources: [{ title: "Bases públicas y subastas numismáticas", url: "https://google.com" }],
      notes: parsedData.notes || rawText,
    };
  } catch (error: any) {
    console.error("Error al ejecutar valuateItem:", error);
    // Muestra el mensaje de error real en la pantalla
    throw new Error(error?.message || "Error al procesar la tasación.");
  }
}

/**
 * Detección automática de categorías
 */
export async function detectCategoryFromPhotos(photos: string[]): Promise<string> {
  if (!photos || photos.length === 0) return "auto";

  try {
    const imageParts = photos
      .map(formatInlineData)
      .filter((part): part is NonNullable<typeof part> => part !== null);

    if (imageParts.length === 0) return "auto";

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
