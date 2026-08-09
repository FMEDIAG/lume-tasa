import React, { useEffect, useState } from "react";
import { getAllValuations, ValuationRecord } from "@/lib/db";
import { generateValuationPDF } from "@/lib/pdfExporter";
import {
  History,
  FileDown,
  Building2,
  MapPin,
  Calendar,
  Sparkles,
  Layers,
  Loader2,
  Search,
} from "lucide-react";

export function ValuationHistory() {
  const [history, setHistory] = useState<ValuationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Cargar el historial desde IndexedDB (LumeDB)
  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const records = await getAllValuations();
      // Ordenar por fecha descendente (más recientes primero)
      const sorted = records.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setHistory(sorted);
    } catch (error) {
      console.error("Error al cargar el historial de LumeDB:", error);
    } finally {
      setLoading(false);
    }
  };

  // Formateador estricto de moneda sin redondeo
  const formatExactCurrency = (amount: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  // Filtrado de búsquedas
  const filteredHistory = history.filter(
    (item) =>
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.assetType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.location.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      {/* Encabezado del Historial */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-xl font-black text-foreground flex items-center gap-2">
            <History className="h-6 w-6 text-sky-500" />
            Historial de Tasaciones LumeDB
          </h2>
          <p className="text-xs font-medium text-muted-foreground">
            Registros almacenados en local con resolución nativa y métricos exactos.
          </p>
        </div>

        {/* Buscador de Expedientes */}
        <div className="relative min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID, zona o tipo..."
            className="w-full rounded-xl border border-input bg-background pl-9 pr-3 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Estado de Carga */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
          <span className="text-xs font-semibold">Cargando registros desde LumeDB...</span>
        </div>
      )}

      {/* Lista Vacía */}
      {!loading && filteredHistory.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">
            No se encontraron tasaciones guardadas.
          </p>
          <p className="text-xs text-muted-foreground">
            Realiza una primera valoración para guardarla automáticamente en el historial.
          </p>
        </div>
      )}

      {/* Grid de Expedientes del Historial */}
      {!loading && filteredHistory.length > 0 && (
        <div className="space-y-4">
          {filteredHistory.map((record) => {
            const macroCount = record.images.filter((img) => img.isMacro).length;
            const dateStr = new Date(record.createdAt).toLocaleDateString(
              "es-ES",
              {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }
            );

            return (
              <div
                key={record.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-xs font-black text-sky-500 border border-sky-500/20">
                      {record.id}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      {dateStr}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => generateValuationPDF(record)}
                    className="flex items-center gap-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition active:scale-95"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    <span>Descargar PDF</span>
                  </button>
                </div>

                {/* Datos e Importe */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold text-muted-foreground uppercase">
                      Activo & Ubicación
                    </span>
                    <p className="text-xs font-bold text-foreground flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 text-sky-500" />
                      {record.assetType}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {record.location}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold text-muted-foreground uppercase">
                      Evidencias
                    </span>
                    <p className="text-xs font-semibold text-foreground flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-sky-500" />
                      {record.images.length} Capturas
                    </p>
                    {macroCount > 0 && (
                      <p className="text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        {macroCount} en modo Macro
                      </p>
                    )}
                  </div>

                  <div className="space-y-1 sm:text-right">
                    <span className="text-[10px] font-extrabold text-muted-foreground uppercase">
                      Tasación Final (Sin Redondeo)
                    </span>
                    <p className="text-lg font-black text-foreground">
                      {formatExactCurrency(record.totalValuation)}
                    </p>
                    <p className="text-[11px] font-bold text-sky-600 dark:text-sky-400">
                      {record.exactPricePerM2.toLocaleString("es-ES", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      €/m² ({record.usefulArea.toFixed(2)} m²)
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
