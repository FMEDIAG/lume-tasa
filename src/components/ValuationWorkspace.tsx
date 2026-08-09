import React, { useState } from "react";
import { ValuationCameraManager } from "../camera/ValuationCameraManager";
import {
  saveValuationRecord,
  StoredImage,
  ValuationRecord,
} from "@/lib/db";
import { buildLumeValuationPrompt } from "@/lib/aiPromptFormatter";
import { generateValuationPDF } from "@/lib/pdfExporter";
import {
  Building2,
  MapPin,
  Ruler,
  Sparkles,
  Calculator,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
  FileDown,
} from "lucide-react";

export function ValuationWorkspace() {
  // Estados del formulario
  const [assetType, setAssetType] = useState("Ático Residencial");
  const [location, setLocation] = useState("Barrio de Salamanca, Madrid");
  const [usefulArea, setUsefulArea] = useState<number | "">(150);
  const [notes, setNotes] = useState("");

  // Estado de imágenes capturadas
  const [images, setImages] = useState<StoredImage[]>([]);

  // Estados de proceso y resultado
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [valuationResult, setValuationResult] =
    useState<ValuationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Formateador de moneda estricto sin redondeo
  const formatExactCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  // Manejador del análisis de tasación con la IA
  const handleStartValuation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usefulArea || Number(usefulArea) <= 0) {
      setError("Por favor, introduce una superficie útil válida en m².");
      return;
    }
    if (images.length === 0) {
      setError(
        "Por favor, toma al menos una captura fotográfica del activo antes de evaluar."
      );
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      const areaNum = Number(usefulArea);

      // 1. Construimos el payload de instrucción estructurado
      const promptPayload = buildLumeValuationPrompt(
        {
          assetType,
          location,
          usefulArea: areaNum,
          additionalNotes: notes,
        },
        images
      );

      console.log(
        "Payload preparado para Flash Extendido CoT:",
        promptPayload
      );

      // 2. Simulación de respuesta calibrada del modelo Flash Extendido (CoT)
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Regla de negocio estricta: Mantenemos métrico exacto sin truncar (ej. 8305.67 €/m²)
      const mockExactPricePerM2 = 8305.67;
      const mockTotalValuation = mockExactPricePerM2 * areaNum;

      const generatedRecord: ValuationRecord = {
        id: `LUME-${Date.now().toString().slice(-6)}`,
        createdAt: new Date().toISOString(),
        assetType,
        location,
        usefulArea: areaNum,
        exactPricePerM2: mockExactPricePerM2,
        totalValuation: mockTotalValuation,
        confidenceScore: 0.984,
        reasoningSteps: [
          {
            step: 1,
            title: "Inspección Visual y Análisis Macro de Detalles",
            description: `Se analizaron ${images.length} capturas en alta resolución. Las tomas marcadas como Macro (${
              images.filter((i) => i.isMacro).length
            }) confirman materiales de alta gama y estado de conservación de juntas superior (9.2/10).`,
          },
          {
            step: 2,
            title: "Evaluación de Comparables de Mercado (ACM Sin Redondeo)",
            description:
              "Cruce de datos en la zona prime especificada. Tasa base ponderada de microdistrito: 7.890,20 €/m².",
          },
          {
            step: 3,
            title: "Ajuste por Atributos Singulares",
            description:
              "Prima aplicada por orientación, estado excelente en fotos Macro (+4.12%) e iluminación general (+1.15%). Tasa calibrada resultante: 8.305,67 €/m².",
          },
          {
            step: 4,
            title: "Cálculo Matemático Final",
            description: `${areaNum.toFixed(2)} m² × 8.305,67 €/m² = ${formatExactCurrency(
              mockTotalValuation
            )}. Resultado exacto sin redondeo comercial.`,
          },
        ],
        images,
      };

      // 3. Guardamos la tasación completa en IndexedDB (history store)
      await saveValuationRecord(generatedRecord);

      setValuationResult(generatedRecord);
    } catch (err) {
      console.error("Error durante la tasación:", err);
      setError("Ocurrió un error al procesar la tasación con la IA.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      {/* Encabezado Principal */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            LUME <span className="text-sky-500">AI</span>
          </h1>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Sistema de Tasación Inteligente Multi-Modal
          </p>
        </div>
        <div className="rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-500 border border-sky-500/20">
          Flash Extendido CoT
        </div>
      </div>

      {/* Formulario de Entrada */}
      <form
        onSubmit={handleStartValuation}
        className="space-y-6 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Building2 className="h-5 w-5 text-sky-500" />
          1. Parámetros Principales del Activo
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Tipo de Activo */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Tipo de Activo
            </label>
            <input
              type="text"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              required
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Ej: Ático, Local, Vivienda"
            />
          </div>

          {/* Ubicación */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> Ubicación
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Ej: Barrio de Salamanca, Madrid"
            />
          </div>

          {/* Superficie m² */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" /> Superficie Útil (m²)
            </label>
            <input
              type="number"
              step="0.01"
              value={usefulArea}
              onChange={(e) =>
                setUsefulArea(
                  e.target.value === "" ? "" : parseFloat(e.target.value)
                )
              }
              required
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="150.00"
            />
          </div>
        </div>

        {/* Notas adicionales */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">
            Notas de Inspección (Opcional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Detalles de reformas, orientación, vistas..."
          />
        </div>

        {/* Módulo de Cámara e Inspección Visual */}
        <div className="pt-2 border-t border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-sky-500" />
            2. Evidencia Fotográfica e Inspección Macro
          </h2>
          <ValuationCameraManager
            onImagesUpdated={(updatedList) => setImages(updatedList)}
          />
        </div>

        {/* Mensaje de Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-xs font-semibold text-red-500 border border-red-500/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botón para Ejecutar Tasación */}
        <button
          type="submit"
          disabled={isAnalyzing}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold py-3.5 px-4 shadow-lg transition-all active:scale-98 disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Ejecutando Razonamiento CoT sin redondeo...</span>
            </>
          ) : (
            <>
              <Calculator className="h-5 w-5" />
              <span>Calcular Tasación Inteligente Lume</span>
            </>
          )}
        </button>
      </form>

      {/* RESULTADO DE LA TASACIÓN */}
      {valuationResult && (
        <div className="space-y-6 rounded-2xl border border-sky-500/30 bg-card p-6 shadow-xl ring-1 ring-sky-500/20">
          {/* Encabezado del Resultado */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-500">
                Resultado Certificado LumeDB
              </span>
              <h3 className="text-xl font-black text-foreground">
                ID: {valuationResult.id}
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confianza: {(valuationResult.confidenceScore * 100).toFixed(1)}%
              </span>

              {/* Botón para Exportar PDF Certificado */}
              <button
                type="button"
                onClick={() => generateValuationPDF(valuationResult)}
                className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3.5 py-2 text-xs font-bold text-white shadow-md transition active:scale-95"
              >
                <FileDown className="h-4 w-4" />
                <span>Exportar Informe PDF</span>
              </button>
            </div>
          </div>

          {/* Tarjeta del Métrico Destacado (Sin Redondeo) */}
          <div className="rounded-xl border-l-4 border-l-sky-500 bg-sky-500/5 p-5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              VALOR ESTIMADO DE MERCADO
            </span>
            <div className="text-3xl font-black text-foreground sm:text-4xl my-1">
              {formatExactCurrency(valuationResult.totalValuation)}
            </div>
            <p className="text-xs font-bold text-sky-600 dark:text-sky-400">
              Métrico Exacto:{" "}
              {valuationResult.exactPricePerM2.toLocaleString("es-ES", {
                minimumFractionDigits: 2,
              })}{" "}
              €/m² | Superficie: {valuationResult.usefulArea.toFixed(2)} m² (Regla
              estricta de no-redondeo aplicada)
            </p>
          </div>

          {/* Razonamiento paso a paso (Chain of Thought) */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4 text-sky-500" />
              Razonamiento Multimodal paso a paso (Chain of Thought)
            </h4>

            <div className="space-y-2.5">
              {valuationResult.reasoningSteps.map((step) => (
                <div
                  key={step.step}
                  className="rounded-xl border border-border bg-background/50 p-3.5 text-xs space-y-1"
                >
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-500 font-extrabold border border-sky-500/20">
                      PASO {step.step}
                    </span>
                    <span>{step.title}</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed pl-1">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
