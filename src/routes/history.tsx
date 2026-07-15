import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  deleteValuation,
  getHistory,
  type Valuation,
} from "@/lib/history";
import { translations, type Lang } from "@/lib/i18n";

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
  const [lang, setLang] = useState<Lang>("es");

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

        {items.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">{t.empty}</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {items.map((v) => (
              <li key={v.id} className="glass-crystal rounded-2xl p-4">
                <div className="flex gap-3">
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
                      <button
                        onClick={() => deleteValuation(v.id)}
                        className="text-muted-foreground transition hover:text-destructive"
                        aria-label={t.delete}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {v.identification}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
