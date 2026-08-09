import { StoredImage } from "./db";

export interface PropertyParams {
  assetType: string;       // Ej: "Ático Residencial", "Local Comercial"
  location: string;        // Ej: "Calle Velázquez, Madrid"
  usefulArea: number;      // Superficie en m²
  yearBuilt?: number;      // Año de construcción
  additionalNotes?: string;// Notas adicionales del usuario
}

export interface PromptPayload {
  systemInstruction: string;
  userPrompt: string;
  imagePayloads: {
    dataUrl: string;
    description: string;
  }[];
}

/**
 * Genera las instrucciones estructuradas para el modelo Flash Extendido (Chain of Thought)
 * respetando la regla estricta de NO REDONDEAR precios ni coeficientes.
 */
export function buildLumeValuationPrompt(
  params: PropertyParams,
  images: StoredImage[]
): PromptPayload {
  // 1. Clasificación y marcado contextual de imágenes
  const imagePayloads = images.map((img, index) => {
    const macroTag = img.isMacro
      ? `[CAPTURA MACRO DETALLE ${img.zoom}x]: Analiza exclusivamente acabados, textura de materiales, conservación de juntas, desgaste o calidad de construcción. NO interpretes esta imagen como un espacio o habitación completa.`
      : `[VISTA GENERAL ${img.zoom}x]: Analiza la distribución espacial, luminosidad y amplitud del área.`;

    return {
      dataUrl: img.dataUrl,
      description: `Imagen ${index + 1}: ${macroTag}`,
    };
  });

  // 2. Instrucciones de Sistema imperativas
  const systemInstruction = `
Eres LUME, un sistema experto de tasación e inspección técnica de activos e inmuebles de alto valor.

REGLAS STRICTAS E INVIOLABLES DE VALORACIÓN:
1. REGLA DE NO REDONDEO: Está estrictamente PROHIBIDO redondear o truncar el precio por m² o la valoración total. Debes mantener exactamente 2 decimales en todos los cálculos intermedios y finales (ejemplo: 8305.67 €/m², NUNCA 8300 €/m² ni 8310 €/m²). La precisión exacta es crítica para activos de alto valor.
2. CHAIN OF THOUGHT (CoT): Debes razonar de forma transparente en 4 pasos estructurados antes de emitir tu veredicto final.
3. ANÁLISIS MULTIMODAL MACRO: Si hay imágenes marcadas como [CAPTURA MACRO DETALLE], evalúa la calidad técnico-constructiva (materiales como parquet, mármol, carpintería, grado de desgaste) y aplica una bonificación o penalización exacta sobre la tasa base.
`.trim();

  // 3. Prompt de usuario con parámetros de la propiedad
  const userPrompt = `
Por favor, efectúa la tasación oficial de Lume con los siguientes datos y las imágenes adjuntas:

DATOS DEL ACTIVO:
- Tipo de Activo: ${params.assetType}
- Ubicación / Zona: ${params.location}
- Superficie Útil: ${params.usefulArea} m²
${params.yearBuilt ? `- Año de Construcción: ${params.yearBuilt}` : ''}
${params.additionalNotes ? `- Notas de Inspección: ${params.additionalNotes}` : ''}

EVIDENCIA FOTOGRÁFICA REGISTRADA (${images.length} capturas):
${imagePayloads.map((img, idx) => `  ${idx + 1}. ${img.description}`).join('\n')}

ESTRUCTURA OBLIGATORIA DE LA RESPUESTA EN JSON:
Responde ÚNICAMENTE con un objeto JSON válido que siga este esquema exacto:

{
  "exactPricePerM2": 0.00,
  "totalValuation": 0.00,
  "confidenceScore": 0.00,
  "reasoningSteps": [
    {
      "step": 1,
      "title": "Inspección Visual y Análisis Macro de Materiales",
      "description": "Explicación detallada..."
    },
    {
      "step": 2,
      "title": "Evaluación de Mercado y Comparables (ACM)",
      "description": "Explicación detallada..."
    },
    {
      "step": 3,
      "title": "Ajuste por Atributos Singulares y Conservación",
      "description": "Explicación detallada..."
    },
    {
      "step": 4,
      "title": "Cálculo Matemático Final Exacto",
      "description": "Explicación detallada..."
    }
  ]
}
`.trim();

  return {
    systemInstruction,
    userPrompt,
    imagePayloads,
  };
}
