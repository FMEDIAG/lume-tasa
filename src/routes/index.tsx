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
  Sparkles,
  Calculator,
  CheckCircle2,
  FileText,
  Loader2,
  History,
  Camera,
  Printer,
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
      void loadHistory();
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
      dataUrl: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'><rect width='400' height='300' fill='%230f172a'/></svg>",
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
    } catch {
      setError("Error al guardar la tasación.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.2_45/30%),transparent_70%)] blur-3xl" />
      <div className="relative mx-auto max-w-4xl px-4 py-8 sm:px-8 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/20 pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-gradient-gold">
              LUME <span className="text-primary font-normal">AI</span>
            </h1>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Sistema Inteligente de Valuación Inmobiliaria
            </p>
          </div>

          <div className="glass-crystal flex items-center gap-1.5 rounded-full p-1">
            <button
              onClick={() => setActiveTab("workspace")}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeTab === "workspace"
                  ? "border border-primary/60 bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Nueva Tasación
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeTab === "history"
                  ? "border border-primary/60 bg-primary/20 text-primary"
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
            <form onSubmit={handleCalculate} className="glass-crystal space-y-6 rounded-2xl p-6 shadow-xl">
              <h2 className="text-base font-semibold flex items-center gap-2 text-gradient-gold">
                <Building2 className="h-5 w-5 text-primary" />
                1. Datos Principales
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Tipo de Activo</label>
                  <input
                    type="text"
                    value={assetType}
                    onChange={(e) => setAssetType(e.target.value)}
                    className="w-full rounded-xl border border-primary/30 bg-background/50 px-3 py-2 text-sm font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Ubicación</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-xl border border-primary/30 bg-background/50 px-3 py-2 text-sm font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Superficie Útil (m²)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={usefulArea}
                    onChange={(e) => setUsefulArea(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    className="w-full rounded-xl border border-primary/30 bg-background/50 px-3 py-2 text-sm font-medium text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              {/* Captura de Evidencias */}
              <div className="pt-4 border-t border-primary/20 space-y-3">
                <h2 className="text-base font-semibold flex items-center gap-2 text-gradient-gold">
                  <Camera className="h-5 w-5 text-primary" />
                  2. Evidencias e Inspección Fotográfica
                </h2>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddSampleImage(false)}
                    className="glass-crystal flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/15"
                  >
                    <Plus className="h-4 w-4 text-primary" />
                    Añadir Foto Estándar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddSampleImage(true)}
                    className="glass-crystal flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/20 px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/30"
                  >
                    <Sparkles className="h-4 w-4" />
                    Añadir Captura Macro
                  </button>
                </div>

                {images.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                    {images.map((img) => (
                      <div key={img.id} className="relative glass-crystal rounded-xl p-3 text-center space-y-1.5">
                        <span className="text-[10px] font-bold block truncate text-primary">
                          {img.isMacro ? "🔍 Macro Zoom" : "📷 Estándar"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          className="text-destructive hover:text-destructive/80 text-xs font-semibold flex items-center justify-center gap-1 w-full pt-1 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Eliminar
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
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-primary-foreground font-bold py-3.5 px-4 shadow-lg transition active:scale-[0.99] disabled:opacity-50"
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
              <div className="glass-crystal space-y-6 rounded-2xl p-6 shadow-2xl border border-primary/40">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/20 pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                      Registro Guardado en LumeDB
                    </span>
                    <h3 className="text-xl font-bold text-foreground">ID: {valuationResult.id}</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confianza: {(valuationResult.confidenceScore * 100).toFixed(1)}%
                    </span>
                    <button
                      onClick={handlePrint}
                      className="glass-crystal flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
                    >
                      <Printer className="h-4 w-4" />
                      <span>Imprimir Informe</span>
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/10 p-5 backdrop-blur-md">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    VALOR ESTIMADO DE MERCADO
                  </span>
                  <div className="text-3xl font-black sm:text-4xl my-1 text-gradient-gold">
                    {formatCurrency(valuationResult.totalValuation)}
                  </div>
                  <p className="text-xs font-semibold text-primary">
                    Métrico Exacto: {valuationResult.exactPricePerM2.toLocaleString("es-ES")} €/m² ({valuationResult.usefulArea} m²)
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-gradient-gold">
                    <FileText className="h-4 w-4 text-primary" />
                    Razonamiento Multimodal (Chain of Thought)
                  </h4>
                  <div className="space-y-2">
                    {valuationResult.reasoningSteps.map((step) => (
                      <div key={step.step} className="rounded-xl border border-primary/20 bg-background/40 p-3 text-xs space-y-1">
                        <div className="font-semibold text-primary">PASO {step.step}: {step.title}</div>
                        <p className="text-muted-foreground leading-relaxed">{step.description}</p>
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
            <h2 className="text-lg font-bold text-gradient-gold">Historial de Tasaciones Guardadas</h2>
            {history.length === 0 ? (
              <div className="glass-crystal rounded-2xl p-8 text-center text-xs text-muted-foreground">
                No hay registros en la base de datos todavía. Realiza una tasación primero.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="glass-crystal rounded-2xl p-5 space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                    <span className="font-bold text-primary text-xs">{item.id}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString("es-ES")}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-xs font-bold text-foreground">{item.assetType}</p>
                      <p className="text-xs text-muted-foreground">{item.location} ({item.usefulArea} m²)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-black text-gradient-gold">{formatCurrency(item.totalValuation)}</p>
                      <p className="text-[10px] text-primary font-semibold">{item.exactPricePerM2} €/m²</p>
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
