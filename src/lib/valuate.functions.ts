import { GoogleGenAI } from "@google/genai";

// Inicialización del cliente de Gemini utilizando la API Key guardada en las variables de entorno
const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || "",
});

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ValuateOptions {
  photos: string[]; // Lista de imágenes codificadas en Base64 (ej: "data:image/jpeg;base64,...")
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
 * Convierte una cadena de imagen base64 al formato compatible con Gemini InlineData
 */
function formatInlineData(base64String: string) {
  const match = base64String.match(/^data:(image\/\w+);base64,(.*)$/);
  if (match) {
    return {
      inlineData: {
        mimeType: match[1],
        data: match[2],
      },
    };
  }
  return {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64String,
    },
  };
}

/**
 * Función principal para tasar objetos con Gemini 2.5 Flash + Búsqueda Web en tiempo real (Google Grounding)
 */
export async function valuateItem(options: ValuateOptions): Promise<AppraisalResult> {
  const { photos, category = "auto", condition = "unknown", context = "", lang = "es" } = options;

  try {
    // 1. Convertir imágenes enviadas al formato multimodal de Gemini
    const imageParts = photos.map(formatInlineData);

    // 2. Construir la consulta detallada para el modelo
    const promptText = `
Analiza la(s) imagen(es) adjunta(s) y la información del objeto para realizar una tasación profesional:
- Categoría seleccionada: ${category}
- Condición del objeto: ${condition}
- Contexto adicional: ${context || "Ninguno"}
- Idioma de respuesta: ${lang === "es" ? "Español" : "Inglés"}

INSTRUCCIONES Y REGLAS DE TASACIÓN:
1. Utiliza la Búsqueda en Google para encontrar cotizaciones actuales, ventas recientes finalizadas o comparables en el mercado global.
2. Si el objeto contiene metales preciosos (oro, plata, platino) o es una moneda/lingote:
   - Busca en internet la cotización SPOT actual por gramo o por onza en EUR/USD.
   - Calcula el valor base: Peso (g) * (Pureza / 1000) * Precio Spot por gramo.
   - JAMÁS restes importes arbitrarios ni devuelvas un resultado negativo. El importe DEBE ser estrictamente positivo.
3. Responde **ÚNICAMENTE** en formato JSON válido dentro de un bloque de código \`\`\`json con esta estructura:
{
  "identification": "Nombre e identificación del objeto",
  "priceMin": 850,
  "priceMax": 1000,
  "currency": "EUR",
  "confidence": "high",
  "notes": "Detalles del valor calculado, cotización usada y fuentes de referencia."
}

*(Nota: El campo "confidence" debe tomar estrictamente uno de estos tres valores: "high", "medium" o "low")*
`;

    // 3. Petición a Gemini con Google Search activado
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [...imageParts, promptText],
      config: {
        tools: [{ googleSearch: {} }],
        systemInstruction:
          "Eres el perito tasador de Lume. Realizas valoraciones precisas y realistas respaldadas por datos actuales de internet. Garantizas cálculos matemáticos correctos y positivos.",
      },
    });

    const rawText = response.text || "";

    // 4. Extraer los enlaces web reales de las fuentes consultadas por Google Search Grounding
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .filter((chunk) => chunk.web?.uri)
      .map((chunk) => ({
        title: chunk.web?.title || chunk.web?.uri || "Fuente pública de mercado",
        url: chunk.web?.uri || "",
      }));

    // 5. Parsear la respuesta JSON devuelta por el modelo
    const parsedData = parseGeminiJsonResponse(rawText);

    const priceMin = Math.max(0, parsedData.priceMin || 0);
    const priceMax = Math.max(priceMin, parsedData.priceMax || priceMin);

    return {
      identification: parsedData.identification || (lang === "es" ? "Objeto analizado" : "Analyzed item"),
      priceMin,
      priceMax,
      currency: parsedData.currency || "EUR",
      confidence: validateConfidence(parsedData.confidence),
      sources: sources.length > 0 ? sources : [{ title: "Bases públicas globales", url: "https://google.com" }],
      notes: parsedData.notes || rawText,
    };
  } catch (error) {
    console.error("Error al ejecutar valuateItem:", error);
    throw new Error("No se pudo completar la tasación. Inténtalo de nuevo.");
  }
}

/**
 * Función para detectar automáticamente la categoría a partir de las fotos
 */
export async function detectCategoryFromPhotos(photos: string[]): Promise<string> {
  if (!photos || photos.length === 0) return "auto";

  try {
    const imageParts = photos.map(formatInlineData);
    const prompt = `Identifica a qué categoría pertenece el objeto de las fotos de entre las siguientes opciones:
[art, cards, coins, stamps, watches, jewelry, electronics, books, music instrument, toys, vinyl, fashion, sports, memorabilia, bonsai, wine, furniture, militaria, luxury bags, minerals, gemstones, vehicles, boats, realestate, other]

Responde ÚNICAMENTE con la clave exacta de la categoría (ejemplo: "coins" o "watches").`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [...imageParts, prompt],
    });

    const categoryDetected = (response.text || "").trim().toLowerCase();
    return categoryDetected || "other";
  } catch (err) {
    console.error("Error al detectar la categoría:", err);
    return "auto";
  }
}

/**
 * Funciones auxiliares para procesar el JSON devuelto y validar campos
 */
function parseGeminiJsonResponse(rawText: string): any {
  try {
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : rawText;
    return JSON.parse(jsonString);
  } catch (e) {
    console.warn("Fallo al procesar el JSON devuelto por Gemini:", e);
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
