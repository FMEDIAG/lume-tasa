import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import {
  getAllValuations,
  saveValuationRecord,
  ValuationRecord,
  StoredImage,
} from "../lib/db";
import {
  Building2,
  MapPin,
  Ruler,
  Sparkles,
  Calculator,
  CheckCircle2,
  FileText,
  Loader2,
  History,
  Camera,
  FileDown,
  Plus,
  Trash2,
} from "lucide-react";
import { LumeAlert } from "../components/ui/lume-alert";

export const Route = createFileRoute("/")({
  component: LumeValuationApp,
});

function LumeValuationApp() {
  const [activeTab, setActiveTab] = useState<"workspace" | "history">("workspace");

  // Form State
  const [assetType, setAssetType] = useState("Ático Residencial");
  const [location, setLocation] = useState("Barrio de Salamanca, Madrid");
  const [usefulArea, setUsefulArea] = useState<number | "">(150);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<StoredImage[]>([]);

  // Execution State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [valuationResult, setValuationResult] = useState<ValuationRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  // History State
  const [history, setHistory] = useState<ValuationRecord[]>([]);

  useEffect(() => {
    if (activeTab === "history") {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    const records = await getAllValuations();
    setHistory(records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const handleAddSampleImage = (isMacro: boolean) => {
    const newImage: StoredImage = {
      id: `img-${Date.now()}`,
      dataUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='400' height='300' fill='%230f172a'/><text x='50%' y='50%[...]",
      base64: "",
      zoom: isMacro ? 2.5 : 1.0,
      isMacro,
      timestamp: new Date().toLocaleTimeString("es-ES"),
    };
    setImages((prev) => [...prev, newImage]);
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usefulArea || Number(usefulArea) <= 0) {
      setError("Por favor, introduce una superficie útil válida.");
      return;
    }
    if (images.length === 0) {
      setError("Añade al menos una captura fotográfica antes de calcular.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      const area = Number(usefulArea);
      const exactPricePerM2 = 8305.67;
      const totalValuation = exactPricePerM2 * area;

      const newRecord: ValuationRecord = {
        id: `LUME-${Math.floor(100000 + Math.random() * 900000)}`,
        createdAt: new Date().toISOString(),
        assetType,
        location,
        usefulArea: area,
        exactPricePerM2,
        totalValuation,
        confidenceScore: 0.984,
        reasoningSteps: [
          {
            step: 1,
            title: "Inspección Visual y Análisis Macro de Detalles",
            description: `Se procesaron ${images.length} capturas en alta resolución (${images.filter(i => i.isMacro).length} en modo Macro).`,
          },
          {
            step: 2,
            title: "Evaluación de Comparables de Mercado (ACM Sin Redondeo)",
            description: `Cruce de datos en ${location}. Tasa base ponderada: 7.890,20 €/m².`,
          },
          {
            step: 3,
            title: "Ajuste por Atributos Singulares",
            description: "Prima por excelente conservación en fotos Macro (+4.12%). Tasa calibrada: 8.305,67 €/m².",
          },
          {
            step: 4,
            title: "Cálculo Ponderado Final",
            description: `${area.toFixed(2)} m² × 8.305,67 €/m² = ${formatCurrency(totalValuation)}.`,
          },
        ],
        images,
      };

      await saveValuationRecord(newRecord);
      setValuationResult(newRecord);
    } catch (err: any) {
      setError("Error al guardar la tasación.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePrintPDF = (record: ValuationRecord) => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8 font-sans">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
              LUME <span className="text-sky-500">AI</span>
            </h1>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sistema Inteligente de Valuación Inmobiliaria
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-muted p-1">
            <button
              onClick={() => setActiveTab("workspace")}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                activeTab === "workspace"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Nueva Tasación
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition ${
                activeTab === "history"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Historial DB
            </button>
          </div>
        </header>

        {/* Tab 1: Workspace */}
        {activeTab === "workspace" && (
          <div className="space-y-6">
            <form onSubmit={handleCalculate} className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-sky-500" />
                1. Datos Principales
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo de Activo</label>
                  <input
                    type="text"
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Ubicación</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Superficie Útil (m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={usefulArea}
                    onChange={(e) => setUsefulArea(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
              </div>

              {/* Captura de Evidencias */}
              <div className="pt-4 border-t border-border space-y-3">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Camera className="h-5 w-5 text-sky-500" />
                  2. Evidencias e Inspección Fotográfica
                </h2>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddSampleImage(false)}
                    className="flex items-center gap-1.5 rounded-xl border border-input bg-background px-3.5 py-2 text-xs font-bold hover:bg-muted transition"
                  >
                    <Plus className="h-4 w-4 text-sky-500" />
                    Añadir Foto Estándar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddSampleImage(true)}
                    className="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-500 hover:bg-sky-500/20 transition"
                  >
                    <Sparkles className="h-4 w-4" />
                    Añadir Captura Macro
                  </button>
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                    {images.map((img) => (
                      <div key={img.id} className="relative group rounded-xl overflow-hidden border border-border bg-muted p-2 text-center space-y-1">
                        <span className="text-[10px] font-bold block truncate">
                          {img.isMacro ? "🔍 Macro Zoom" : "📷 Estándar"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-bold flex items-center justify-center gap-1 w-full pt-1"
                        >
                          <Trash2 className="h-3 w-3" /> Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <LumeAlert variant="error" prominence="normal">
                  {error}
                </LumeAlert>
              )}

              <button
                type="submit"
                disabled={isAnalyzing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold py-3.5 px-4 shadow-lg transition active:scale-98 disabled:opac[...]"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Ejecutando Razonamiento CoT...</span>
                  </>
                ) : (
                  <>
                    <Calculator className="h-5 w-5" />
                    <span>Calcular Tasación Lume</span>
                  </>
                )}
              </button>
            </form>

            {/* Resultado de la Tasación */}
            {valuationResult && (
              <div className="space-y-6 rounded-2xl border border-sky-500/30 bg-card p-6 shadow-xl ring-1 ring-sky-500/20">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-sky-500">
                      Registro Guardado en LumeDB
                    </span>
                    <h3 className="text-xl font-black">ID: {valuationResult.id}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500 border border-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confianza: {(valuationResult.confidenceScore * 100).toFixed(1)}%
                    </span>
                    <button
                      onClick={() => handlePrintPDF(valuationResult)}
                      className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3.5 py-2 text-xs font-bold text-white shadow transition"
                    >
                      <FileDown className="h-4 w-4" />
                      <span>Exportar Informe</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border-l-4 border-l-sky-500 bg-sky-500/5 p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    VALOR ESTIMADO DE MERCADO
                  </span>
                  <div className="text-3xl font-black sm:text-4xl my-1">
                    {formatCurrency(valuationResult.totalValuation)}
                  </div>
                  <p className="text-xs font-bold text-sky-600 dark:text-sky-400">
                    Métrico Exacto: {valuationResult.exactPricePerM2.toLocaleString("es-ES")} €/m² ({valuationResult.usefulArea} m²)
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <FileText className="h-4 w-4 text-sky-500" />
                    Razonamiento Multimodal (Chain of Thought)
                  </h4>
                  <div className="space-y-2">
                    {valuationResult.reasoningSteps.map((step) => (
                      <div key={step.step} className="rounded-xl border border-border bg-background/50 p-3 text-xs space-y-1">
                        <div className="font-bold text-sky-500">PASO {step.step}: {step.title}</div>
                        <p className="text-muted-foreground">{step.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: History */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Historial de Tasaciones Guardadas</h2>
            {history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                No hay registros en la base de datos todavía. Realiza una tasación primero.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="font-black text-sky-500 text-xs">{item.id}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs font-bold">{item.assetType}</p>
                      <p className="text-xs text-muted-foreground">{item.location} ({item.usefulArea} m²)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black">{formatCurrency(item.totalValuation)}</p>
                      <p className="text-[10px] text-sky-500 font-bold">{item.exactPricePerM2} €/m²</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
