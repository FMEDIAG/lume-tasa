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
 * Convierte una imagen en formato base64 al formato estructurado de Gemini API
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
 * Llamada directa HTTP a la API REST de Gemini (Sin librerías npm)
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

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

/**
 * Función principal de tasación
 */
export async function valuateItem(options: ValuateOptions): Promise<AppraisalResult> {
  const { photos, category = "auto", condition = "unknown", context = "", lang = "es" } = options;

  try {
    const imageParts = (photos || []).map(formatInlineData);

    const promptText = `
Analiza la(s) imagen(es) adjunta(s) y la información del objeto para realizar una tasación profesional:
- Categoría seleccionada: ${category}
- Condición del objeto: ${condition}
- Contexto adicional: ${context || "Ninguno"}
- Idioma de respuesta: ${lang === "es" ? "Español" : "Inglés"}

INSTRUCCIONES Y REGLAS DE TASACIÓN:
1. Revisa el valor real de mercado del objeto.
2. Si el objeto contiene metales preciosos (oro, plata, platino) o es una moneda/lingote:
   - Aplica la cotización SPOT actual del mercado.
   - Calcula el valor base: Peso (g) * Pureza del metal * Precio Spot por gramo.
   - JAMÁS restes importes arbitrarios ni devuelvas un valor negativo. El importe DEBE ser estrictamente positivo.
3. Responde ÚNICAMENTE en formato JSON válido dentro de un bloque de código \`\`\`json con esta estructura exactas:
{
  "identification": "Nombre e identificación precisa del objeto",
  "priceMin": 850,
  "priceMax": 1000,
  "currency": "EUR",
  "confidence": "high",
  "notes": "Detalles del cálculo realizado, valores de referencia y explicación."
}

(El campo "confidence" debe ser estrictamente: "high", "medium" o "low").
`;

    const systemInstruction =
      "Eres el perito tasador oficial de Lume. Realizas valoraciones precisas respaldadas por datos de mercado. Garantizas resultados matemáticos correctos y positivos.";

    const contents = [...imageParts, { text: promptText }];
    const rawText = await callGeminiRestApi(contents, systemInstruction);

    const parsedData = parseGeminiJsonResponse(rawText);

    const priceMin = Math.max(0, parsedData.priceMin || 0);
    const priceMax = Math.max(priceMin, parsedData.priceMax || priceMin);

    return {
      identification: parsedData.identification || (lang === "es" ? "Objeto analizado" : "Analyzed item"),
      priceMin,
      priceMax,
      currency: parsedData.currency || "EUR",
      confidence: validateConfidence(parsedData.confidence),
      sources: [{ title: "Mercado de valores e índices públicos", url: "https://google.com" }],
      notes: parsedData.notes || rawText,
    };
  } catch (error) {
    console.error("Error en valuateItem:", error);
    throw new Error("No se pudo completar la tasación. Inténtalo de nuevo.");
  }
}

/**
 * Función para detección de categorías
 */
export async function detectCategoryFromPhotos(photos: string[]): Promise<string> {
  if (!photos || photos.length === 0) return "auto";

  try {
    const imageParts = photos.map(formatInlineData);
    const promptText = `Identifica la categoría del objeto de las fotos entre estas opciones:
[art, cards, coins, stamps, watches, jewelry, electronics, books, music instrument, toys, vinyl, fashion, sports, memorabilia, bonsai, wine, furniture, militaria, luxury bags, minerals, gemstones, vehicles, boats, realestate, other]

Responde ÚNICAMENTE con la clave de la categoría (ejemplo: "coins" o "watches").`;

    const contents = [...imageParts, { text: promptText }];
    const rawText = await callGeminiRestApi(contents);

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
