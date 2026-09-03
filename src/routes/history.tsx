import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteValuation,
  getHistory,
  importHistory,
  type Valuation,
} from "@/lib/history";
import { exportHistoryPdf } from "@/lib/historyPdf";
import { translations, type Lang } from "@/lib/i18n";
import { formatNumber } from "@/lib/formatPrice";
import { extractPricePerSqm } from "@/lib/pricePerSqm";

const ITEMS_PAGE = 5;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB

function sourceUrl(source: string, query: string): string {
  const q = encodeURIComponent(query);
  const s = source.toLowerCase();
  if (s.includes("ebay")) return `https://www.ebay.com/sch/i.html?_nkw=${q}`;
  if (s.includes("wikipedia")) return `https://en.wikipedia.org/wiki/Special:Search?search=${q}`;
  if (s.includes("catawiki")) return `https://www.catawiki.com/en/search?query=${q}`;
  if (s.includes("worthpoint")) return `https://www.worthpoint.com/search?q=${q}`;
  if (s.includes("heritage")) return `https://www.ha.com/search?search=${q}`;
  if (s.includes("chrono24")) return `https://www.chrono24.com/search/index.htm?query=${q}`;
  if (s.includes("discogs")) return `https://www.discogs.com/search/?q=${q}`;
  if (s.includes("scryfall")) return `https://scryfall.com/search?q=${q}`;
  if (s.includes("tcgplayer")) return `https://www.tcgplayer.com/search/all/product?q=${q}`;
  if (s.includes("cardmarket")) return `https://www.cardmarket.com/en/Magic/Products/Search?searchString=${q}`;
  if (s.includes("mtggoldfish")) return `https://www.mtggoldfish.com/q?query_string=${q}`;
  if (s.includes("pricecharting")) return `https://www.pricecharting.com/search-products?type=videogames&q=${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query + " " + source)}`;
}

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Lume — Historial de tasaciones" },
      {
        name: "description",
        content: "Consulta el historial de tasaciones realizadas con Lume.",
      },
    ],
  }),
  component: HistoryPage,
});

const fmt = formatNumber;

function HistoryPage() {
  const [items, setItems] = useState<Valuation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("es");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reloadHistory = async () => {
    const h = await getHistory();
    setItems(h);
    setLoading(false);
  };

  const handleExport = async () => {
    try {
      await exportHistory();
      toast.success(t.exportOk);
    } catch {
      toast.error(t.exportError);
    }
  };

  const handleImport = async (file: File) => {
    try {
      // Paso 1: validar tamaño antes de leer el archivo
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error(
          lang === "es"
            ? "El archivo es demasiado grande (máx. 5 MB)"
            : "File too large (max 5 MB)"
        );
      }
      // Paso 1: validar que realmente sea un JSON
      if (file.type && file.type !== "application/json" && !file.name.endsWith(".json")) {
        throw new Error(
          lang === "es" ? "El archivo debe ser un JSON" : "File must be a JSON"
        );
      }
      const n = await importHistory(await file.text());
      await reloadHistory();
      toast.success(t.importOk(n));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.importError);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteValuation(id);
      await reloadHistory();
    } catch {
      toast.error(lang === "es" ? "Error al eliminar" : "Error deleting item");
    }
  };

  useEffect(() => {
    const read = () => {
      void reloadHistory();
      setLang(((localStorage.getItem("lume:lang") as Lang) || "es"));
    };
    read();

    window.addEventListener("lume:history", read);
    window.addEventListener("lume:lang", read);
    return () => {
      window.removeEventListener("lume:history", read);
      window.removeEventListener("lume:lang", read);
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const t = translations[lang];
  const locale = lang === "es" ? "es-ES" : "en-US";
  const usedCategories = Array.from(
    new Set(items.map((v) => (v.category && v.category in t.categories ? v.category : "other")))
  );
  const filtered = activeTab === "all" ? items : items.filter((v) => (v.category ?? "other") === activeTab);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PAGE));

  // Ajuste automático de página si se eliminan elementos y la página actual queda fuera de rango
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const paginatedItems = filtered.slice((page - 1) * ITEMS_PAGE, page * ITEMS_PAGE);
  const allLabel = lang === "es" ? "Todas" : "All";

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.2_45/30%),transparent_70%)] blur-3xl" />
      <div className="relative mx-auto max-w-xl px-5 pb-16 pt-8">
        <header className="flex items-center gap-3">
          <Link
            to="/"
            className="glass-crystal flex h-10 w-10 items-center justify-center rounded-full text-primary"
            aria-label={t.back}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="flex-1 text-xl font-semibold text-gradient-gold">{t.history}</h1>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="glass-crystal flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary transition hover:bg-primary/15"
            aria-label={t.exportHistory}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t.exportHistory}</span>
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="glass-crystal flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-primary transition hover:bg-primary/15"
            aria-label={t.importHistory}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{t.importHistory}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleImport(f);
            }}
          />
        </header>

        {items.length > 0 && (
          <div className="mt-5 flex min-h-[44px] flex-wrap content-start items-center gap-2 transition-all duration-300 ease-out">
            {[{ key: "all", label: allLabel }, ...usedCategories.map((k) => ({ key: k, label: t.categories[k as keyof typeof t.categories] ?? k }))].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-xs leading-none whitespace-nowrap transition-all duration-200 sm:px-3 sm:py-1.5 ${
                  activeTab === tab.key
                    ? "border-primary/60 bg-primary/20 text-primary font-semibold"
                    : "border-primary/20 bg-background/40 text-muted-foreground hover:text-primary"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="mt-16 text-center text-sm text-muted-foreground animate-pulse">
            {lang === "es" ? "Cargando…" : "Loading…"}
          </p>
        ) : paginatedItems.length === 0 ? (
          <div className="glass-crystal mt-12 rounded-2xl p-8 text-center">
            <p className="text-sm text-muted-foreground">{t.empty}</p>
          </div>
        ) : (
          <>
            <ul className="mt-6 space-y-3">
              {paginatedItems.map((v) => {
                const isOpen = openId === v.id;
                return (
                  <li key={v.id} className="glass-crystal rounded-2xl p-4 transition-all duration-300 ease-out">
                    <button
                      type="button"
                      onClick={() => setOpenId(isOpen ? null : v.id)}
                      aria-expanded={isOpen}
                      className="flex w-full gap-3 text-left"
                    >
                      <img
                        src={v.thumbnail}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-lg object-cover ring-1 ring-primary/30"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                          <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
                            {v.title}
                          </h2>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(v.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                                void handleDelete(v.id);
                              }
                            }}
                            className="-m-1 shrink-0 p-1 text-muted-foreground transition hover:text-destructive"
                            aria-label={t.delete}
                          >
                            <Trash2 className="h-4 w-4" />
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(v.createdAt).toLocaleString(locale)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 font-semibold leading-tight text-primary">
                            €{fmt(v.priceEurMin)}–€{fmt(v.priceEurMax)}
                          </span>
                          <span className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 font-semibold leading-tight text-accent">
                            ${fmt(v.priceUsdMin)}–${fmt(v.priceUsdMax)}
                          </span>
                        </div>
                        {!isOpen && (
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                            {v.identification}
                          </p>
                        )}
                      </div>
                    </button>

                    <div
                      className={`grid transition-all duration-300 ease-out ${
                        isOpen
                          ? "mt-4 grid-rows-[1fr] border-t border-primary/20 pt-3 opacity-100"
                          : "mt-0 grid-rows-[0fr] border-t-0 border-transparent pt-0 opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden space-y-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.identification}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                            {v.identification}
                          </p>
                        </div>
                        <p className="text-[11px] font-medium uppercase text-primary">
                          {t.confidence}: {t.confidenceLevels[v.confidence as keyof typeof t.confidenceLevels] ?? v.confidence}
                        </p>
                        {v.notes && (
                          <div className="rounded-xl border border-primary/25 bg-primary/10 p-3 backdrop-blur-md">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                              {t.notes}
                            </p>
                            {extractPricePerSqm(v.notes).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {extractPricePerSqm(v.notes).map((p) => (
                                  <span
                                    key={p}
                                    className="rounded-full border border-primary/40 bg-primary/20 px-2.5 py-1 text-[11px] font-semibold tabular-nums leading-tight text-primary"
                                  >
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                            <p className="mt-1.5 text-xs leading-relaxed text-foreground/90">
                              {v.notes}
                            </p>
                          </div>
                        )}
                        {v.sources && v.sources.length > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {t.sources}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {v.sources.map((s, i) => (
                                <a
                                  key={i}
                                  href={sourceUrl(s, v.title)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] leading-tight text-primary transition hover:bg-primary/15"
                                >
                                  {s}
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {totalPages > 1 && (
              <nav
                aria-label={lang === "es" ? "Paginación del historial" : "History pagination"}
                className="mt-6 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="glass-crystal rounded-full px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {t.previous}
                </button>
                <span className="text-xs text-muted-foreground">
                  {t.page} {page} {t.of} {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="glass-crystal rounded-full px-4 py-2 text-xs font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {t.next}
                </button>
              </nav>
            )}
          </>
        )}
      </div>
    </div>
  );
}
