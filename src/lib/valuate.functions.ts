import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

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

export async function valuateItem(options: ValuateOptions): Promise<AppraisalResult> {
  const { photos, category = "auto", condition = "unknown", context = "", lang = "es" } = options;

  try {
    const imageParts = photos.map(formatInlineData);

    const promptText = `
Analiza la(s) imagen(es) y la información del objeto para realizar una tasación profesional:
- Categoría: ${category}
- Condición: ${condition}
- Contexto: ${context || "Ninguno"}
- Idioma de respuesta: ${lang === "es" ? "Español" : "Inglés"}

REGLAS DE TASACIÓN:
1. Consulta el mercado global para conocer el valor real actual.
2. Si el objeto contiene metales preciosos (oro, plata, platino) o es una moneda/lingote:
   - Busca la cotización SPOT actual por gramo o por onza en EUR/USD.
   - Calcula el valor base: Peso (g) * Pureza * Precio Spot.
   - JAMÁS restes importes arbitrarios ni devuelvas un resultado negativo. El importe DEBE ser estrictamente positivo.
3. Responde ÚNICAMENTE en formato JSON válido dentro de un bloque de código \`\`\`json con esta estructura:
{
  "identification": "Nombre e identificación del objeto",
  "priceMin": 850,
  "priceMax": 1000,
  "currency": "EUR",
  "confidence": "high",
  "notes": "Detalles del valor calculado, cotización usada y fuentes de referencia."
}
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "Eres el perito tasador de Lume. Realizas valoraciones precisas y realistas respaldadas por datos actuales de internet. Garantizas cálculos matemáticos correctos y positivos.",
    });

    const result = await model.generateContent([...imageParts, promptText]);
    const response = await result.response;
    const rawText = response.text() || "";

    const parsedData = parseGeminiJsonResponse(rawText);

    const priceMin = Math.max(0, parsedData.priceMin || 0);
    const priceMax = Math.max(priceMin, parsedData.priceMax || priceMin);

    return {
      identification: parsedData.identification || (lang === "es" ? "Objeto analizado" : "Analyzed item"),
      priceMin,
      priceMax,
      currency: parsedData.currency || "EUR",
      confidence: validateConfidence(parsedData.confidence),
      sources: [{ title: "Bases públicas globales", url: "https://google.com" }],
      notes: parsedData.notes || rawText,
    };
  } catch (error) {
    console.error("Error al ejecutar valuateItem:", error);
    throw new Error("No se pudo completar la tasación. Inténtalo de nuevo.");
  }
}

export async function detectCategoryFromPhotos(photos: string[]): Promise<string> {
  if (!photos || photos.length === 0) return "auto";

  try {
    const imageParts = photos.map(formatInlineData);
    const prompt = `Identifica la categoría del objeto de entre las siguientes opciones:
[art, cards, coins, stamps, watches, jewelry, electronics, books, music instrument, toys, vinyl, fashion, sports, memorabilia, bonsai, wine, furniture, militaria, luxury bags, minerals, gemstones, vehicles, boats, realestate, other]

Responde ÚNICAMENTE con la clave exacta de la categoría.`;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([...imageParts, prompt]);
    const response = await result.response;

    return (response.text() || "").trim().toLowerCase() || "other";
  } catch (err) {
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
