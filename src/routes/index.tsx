import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { History, Search } from "lucide-react";
import { ValuationHistory } from "./ValuationHistory";

export const Route = createFileRoute("/")({
  component: LumeValuationApp,
});

function LumeValuationApp() {
  return (
    <div style={{ backgroundColor: '#020817', minHeight: '100vh' }}>
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 space-y-6">
        {/* Header Simple */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-500/20 pb-5">
          <div>
            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-amber-400">
              LUME <span className="text-amber-200 font-normal">AI</span>
            </h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">
              Sistema Inteligente de Valuación Inmobiliaria
            </p>
          </div>
        </header>

        {/* Solo el Historial Paginado */}
        <ValuationHistory />
      </div>
    </div>
  );
}