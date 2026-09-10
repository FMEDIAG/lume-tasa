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
 * Convierte imagen base64 al formato compatible con Gemini REST API
 */
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
 * Llamada REST a Gemini con Google Search Grounding activado
 */
async function callGeminiRestApi(contents: any[], systemInstructionText?: string) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

  if (!apiKey) {
    throw new Error("Falta configurar la clave VITE_GEMINI_API_KEY en las variables de entorno.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const bodyPayload: any = {
    contents: [
      {
        parts: contents,
      },
    ],
    // Habilita la búsqueda web en tiempo real para obtener precios reales de mercado
    tools: [
      {
        google_search: {},
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
    const errorText = await response.text();
    console.error("Error devuelto por Gemini API:", errorText);
    throw new Error(`Error ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Función principal para tasar objetos al valor real de mercado
 */
export async function valuateItem(options: ValuateOptions): Promise<AppraisalResult> {
  const { photos, category = "auto", condition = "unknown", context = "", lang = "es" } = options;

  try {
    const imageParts = (photos || []).map(formatInlineData);

    const promptText = `
Analiza exhaustivamente la(s) imagen(es) adjunta(s) y la información provista para realizar una tasación profesional:
- Categoría: ${category}
- Condición del objeto: ${condition}
- Contexto adicional: ${context || "Ninguno"}
- Idioma de respuesta: ${lang === "es" ? "Español" : "Inglés"}

INSTRUCCIONES OBLIGATORIAS DE VALORACIÓN DE MERCADO REAL:
1. BUSCA EN INTERNET (usando Google Search) precios actuales de venta final de este artículo o artículos idénticos/similares en plataformas reales de segunda mano, subastas, portales especializados (eBay, Chrono24, Catawiki, etc.).
2. Determina el VALOR REAL DE MERCADO FINAL (precio de compra/venta estimado entre particulares o mercado minorista). NO calcules precios de empeño, ni de chatarrería, ni precios de liquidación rápida por debajo del valor.
3. Si el objeto posee valor histórico, de marca, numismático o estético, súmalo al valor comercial (no te limites al peso del material si la pieza vale más como obra, joya o antigüedad).
4. Para metales preciosos (oro, plata, etc.), utiliza la cotización SPOT actual internacional en EUR/USD y añade las primas correspondientes según el estado y tipo de pieza.

Responde ÚNICAMENTE con un JSON válido dentro de un bloque de código \`\`\`json con la siguiente estructura exactas:
{
  "identification": "Nombre e identificación exacta del artículo, fabricante, modelo o época",
  "priceMin": 850,
  "priceMax": 1000,
  "currency": "EUR",
  "confidence": "high",
  "notes": "Explicación detallada del valor asignado, comparativa de mercado encontradas en internet y desglose si aplica."
}

(El campo "confidence" debe ser estrictamente: "high", "medium" o "low").
`;

    const systemInstruction =
      "Eres un perito tasador sénior experto en mercado internacional y coleccionismo. Buscas precios reales en internet y valoras los artículos a su precio justo de mercado minorista/segunda mano sin minusvalorarlos.";

    const contents = [...imageParts, { text: promptText }];
    const apiResult = await callGeminiRestApi(contents, systemInstruction);

    const rawText = apiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extraer enlaces y fuentes encontradas durante la búsqueda en tiempo real
    const groundingChunks = apiResult?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const extractedSources = groundingChunks
      .filter((chunk: any) => chunk.web?.uri)
      .map((chunk: any) => ({
        title: chunk.web?.title || "Referencia de mercado en internet",
        url: chunk.web?.uri || "",
      }));

    const parsedData = parseGeminiJsonResponse(rawText);

    const priceMin = Math.max(0, parsedData.priceMin || 0);
    const priceMax = Math.max(priceMin, parsedData.priceMax || priceMin);

    return {
      identification: parsedData.identification || (lang === "es" ? "Objeto analizado" : "Analyzed item"),
      priceMin,
      priceMax,
      currency: parsedData.currency || "EUR",
      confidence: validateConfidence(parsedData.confidence),
      sources: extractedSources.length > 0 ? extractedSources : [{ title: "Búsqueda web en tiempo real", url: "https://google.com" }],
      notes: parsedData.notes || rawText,
    };
  } catch (error) {
    console.error("Error en valuateItem:", error);
    throw new Error("No se pudo completar la tasación. Inténtalo de nuevo.");
  }
}

/**
 * Función para detección automática de categorías
 */
export async function detectCategoryFromPhotos(photos: string[]): Promise<string> {
  if (!photos || photos.length === 0) return "auto";

  try {
    const imageParts = photos.map(formatInlineData);
    const promptText = `Identifica la categoría exacta del objeto en las fotos de entre estas opciones:
[art, cards, coins, stamps, watches, jewelry, electronics, books, music instrument, toys, vinyl, fashion, sports, memorabilia, bonsai, wine, furniture, militaria, luxury bags, minerals, gemstones, vehicles, boats, realestate, other]

Responde ÚNICAMENTE con la clave exacta (ejemplo: "coins" o "watches").`;

    const contents = [...imageParts, { text: promptText }];
    const apiResult = await callGeminiRestApi(contents);
    const rawText = apiResult?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const categoryDetected = rawText.trim().toLowerCase().replace(/[^a-z_]/g, "");
    return categoryDetected || "other";
  } catch (err) {
    console.error("Error al detectar la categoría:", err);
    return "auto";
  }
}

function parseGeminiJsonResponse(rawText: string): any {
  try {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : rawText;
    return JSON.parse(jsonString);
  } catch (e) {
    return {
      identification: "Objeto identificado",
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
