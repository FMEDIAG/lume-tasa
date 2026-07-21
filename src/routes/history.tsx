import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import {
  deleteValuation,
  getHistory,
  type Valuation,
} from "@/lib/history";
import { translations, type Lang } from "@/lib/i18n";

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

function HistoryPage() {
  const [items, setItems] = useState<Valuation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("es");
  const [activeTab, setActiveTab] = useState<string>("all");

  useEffect(() => {
    const read = () => {
      setItems(getHistory());
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

  const t = translations[lang];
  const locale = lang === "es" ? "es-ES" : "en-US";
  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);

  const usedCategories = Array.from(
    new Set(items.map((v) => (v.category && v.category in t.categories ? v.category : "other")))
  );
  const filtered = activeTab === "all" ? items : items.filter((v) => (v.category ?? "other") === activeTab);
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
          <h1 className="text-xl font-semibold text-gradient-gold">{t.history}</h1>
        </header>

        {items.length > 0 && (
          <div className="mt-5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {[{ key: "all", label: allLabel }, ...usedCategories.map((k) => ({ key: k, label: t.categories[k as keyof typeof t.categories] ?? k }))].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition ${
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

        {filtered.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {filtered.map((v) => {
              const isOpen = openId === v.id;
              return (
                <li key={v.id} className="glass-crystal rounded-2xl p-4">
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
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="truncate text-sm font-semibold text-foreground">
                          {v.title}
                        </h2>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteValuation(v.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              deleteValuation(v.id);
                            }
                          }}
                          className="text-muted-foreground transition hover:text-destructive"
                          aria-label={t.delete}
                        >
                          <Trash2 className="h-4 w-4" />
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString(locale)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                          €{fmt(v.priceEurMin)}–€{fmt(v.priceEurMax)}
                        </span>
                        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
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

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-primary/20 pt-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t.identification}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                          {v.identification}
                        </p>
                      </div>
                      <p className="text-[11px] font-medium uppercase text-primary">
                        {t.confidence}: {v.confidence}
                      </p>
                      {v.notes && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.notes}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                            {v.notes}
                          </p>
                        </div>
                      )}
                      {v.sources?.length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {t.sources}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {v.sources.map((s, i) => (
                              <a
                                key={i}
                                href={sourceUrl(s, v.title)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary transition hover:bg-primary/20"
                              >
                                {s}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
