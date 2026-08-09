import { StoredImage, ValuationRecord } from "./db";

// Estructura esperada de la respuesta de Gemini
export interface GeminiValuationResponse {
  exactPricePerM2: number; // Tasa por m² exacta con decimales
  confidenceScore: number; // Ej: 0.98
  reasoningSteps: {
    step: number;
    title: string;
    description: string;
  }[];
}

/**
 * Llama a la API oficial de Google Gemini usando la clave configurada.
 */
export async function analyzeValuationWithGemini(
  params: {
    assetType: string;
    location: string;
    usefulArea: number;
    additionalNotes?: string;
  },
  images: StoredImage[]
): Promise<ValuationRecord> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "No se encontró VITE_GEMINI_API_KEY en las variables de entorno (.env)."
    );
  }

  // 1. Convertimos las fotos de IndexedDB al formato inlineData que requiere Gemini
  const inlineImageParts = images.map((img) => {
    // Si la imagen incluye el prefijo data:image/jpeg;base64, lo limpiamos
    const base64Data = img.base64.includes(",")
      ? img.base64.split(",")[1]
      : img.base64;

    return {
      inline_data: {
        mime_type: "image/jpeg",
        data: base64Data,
      },
    };
  });

  // 2. Prompt del sistema y restricciones matemáticas
  const systemInstruction = `
    Eres Lume AI, un tasador inmobiliario técnico de máxima precisión multimodal.
    REGLA CRÍTICA DE CÁLCULO:
    - NUNCA redondees las cifras ni apliques truncamiento comercial.
    - Calcula la tasa por m² exacta con precisión de al menos 2 decimales (ej. 8305.67 €/m²).
    - Analiza detenidamente las fotos etiquetadas como [MACRO / DETALLE VISUAL] examinando textura, nivel de desgaste, marcas de calidad de acabados y juntas.
  `;

  const userPrompt = `
    INSPECCIÓN TÉCNICA DEL ACTIVO:
    - Tipo de Activo: ${params.assetType}
    - Ubicación: ${params.location}
    - Superficie Útil: ${params.usefulArea} m²
    - Notas Adicionales: ${params.additionalNotes || "Ninguna"}
    - Imágenes adjuntas: ${images.length} (${
    images.filter((i) => i.isMacro).length
  } capturas en modo Macro)

    INSTRUCCIONES:
    1. Revisa las imágenes generales para el estado del inmueble.
    2. Revisa las imágenes Macro para evaluar calidades y conservación detallada.
    3. Devuelve una respuesta en formato JSON que cumpla estrictamente con el siguiente esquema:

    {
      "exactPricePerM2": number, // Ejemplo: 8305.67
      "confidenceScore": number, // Valor entre 0.0 y 1.0
      "reasoningSteps": [
        {
          "step": 1,
          "title": "Título descriptivo del paso CoT",
          "description": "Explicación detallada del razonamiento"
        }
      ]
    }
  `;

  // 3. Petición HTTP directa a la API de Gemini
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: systemInstruction + "\n\n" + userPrompt },
            ...inlineImageParts,
          ],
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.2, // Baja temperatura para mantener precisión y rigor
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Error de Gemini API (${response.status}): ${
        errorData.error?.message || "Error desconocido"
      }`
    );
  }

  const data = await response.json();
  const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawJsonText) {
    throw new Error("Gemini no devolvió un formato válido de respuesta.");
  }

  // 4. Parsear la respuesta estructurada de la IA
  const parsedResponse: GeminiValuationResponse = JSON.parse(rawJsonText);

  // 5. Cálculo matemático exacto de la valoración total
  const exactPricePerM2 = parsedResponse.exactPricePerM2;
  const totalValuation = exactPricePerM2 * params.usefulArea;

  // 6. Retornar el objeto ValuationRecord completo
  const finalRecord: ValuationRecord = {
    id: `LUME-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
    assetType: params.assetType,
    location: params.location,
    usefulArea: params.usefulArea,
    exactPricePerM2,
    totalValuation,
    confidenceScore: parsedResponse.confidenceScore || 0.95,
    reasoningSteps: parsedResponse.reasoningSteps,
    images,
  };

  return finalRecord;
}
