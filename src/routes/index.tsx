import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { ValuationWorkspace } from "../components/valuation/ValuationWorkspace";
import { ValuationHistory } from "../components/history/ValuationHistory";
import { Calculator, History, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  // Estado para controlar la pestaña activa ('workspace' o 'history')
  const [activeTab, setActiveTab] = useState<"workspace" | "history">(
    "workspace"
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col antialiased">
      {/* Barra de Navegación Principal de Lume */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
          {/* Logo e Identidad */}
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-sky-600 flex items-center justify-center text-white font-black text-base shadow-md shadow-sky-600/20">
              L
            </div>
            <div>
              <span className="font-black tracking-tight text-lg text-foreground flex items-center gap-1">
                LUME <span className="text-sky-500 font-extrabold text-xs">SMART</span>
              </span>
            </div>
          </div>

          {/* Selector de Pestañas */}
          <nav className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 border border-border">
            <button
              type="button"
              onClick={() => setActiveTab("workspace")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "workspace"
                  ? "bg-background text-sky-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Calculator className="h-3.5 w-3.5" />
              <span>Nueva Tasación</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "history"
                  ? "bg-background text-sky-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Historial LumeDB</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Área de Contenido Dinámico */}
      <main className="flex-1 py-4">
        {activeTab === "workspace" ? (
          <ValuationWorkspace />
        ) : (
          <ValuationHistory />
        )}
      </main>

      {/* Pie de Página */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-4xl px-4 flex items-center justify-between">
          <p className="flex items-center gap-1 text-[11px] font-medium">
            <Sparkles className="h-3 w-3 text-sky-500" /> Lume Smart Estimator
          </p>
          <p className="text-[11px] text-muted-foreground">
            Soporte Multimodal Macro & Exactitud Métrica
          </p>
        </div>
      </footer>
    </div>
  );
}
