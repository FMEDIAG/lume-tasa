import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Images, Sparkles, History, Trash2, Save, Check, Globe } from "lucide-react";
import { valuateItem } from "@/lib/valuate.functions";
import { translations, type Lang } from "@/lib/i18n";
import { saveValuation, type Valuation } from "@/lib/history";
import lumeIcon from "@/assets/lume-icon.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lume — Tasación de objetos con IA" },
      {
        name: "description",
        content:
          "Lume tasa tus objetos por fotografía usando IA y bases de datos públicas como eBay y Wikipedia. Rangos en EUR y USD, ES/EN.",
      },
      { property: "og:title", content: "Lume — Tasación de objetos con IA" },
      {
        property: "og:description",
        content: "Sube fotos y obtén una tasación con fuentes públicas de todo el mundo.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Index,
});

interface Photo {
  id: string;
  dataUrl: string;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, max = 1280, quality = 0.82): Promise<string> {
  const url = await fileToDataUrl(file);
  const img = new Image();
  img.src = url;
  await new Promise((r) => (img.onload = r));
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function useLangState(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("es");
  useEffect(() => {
    const read = () => setLang(((localStorage.getItem("lume:lang") as Lang) || "es"));
    read();
    window.addEventListener("lume:lang", read);
    return () => window.removeEventListener("lume:lang", read);
  }, []);
  return [
    lang,
    (l) => {
      localStorage.setItem("lume:lang", l);
      window.dispatchEvent(new Event("lume:lang"));
    },
  ];
}

function Index() {
  const navigate = useNavigate();
  const [lang, setLang] = useLangState();
  const t = translations[lang];
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | (Omit<Valuation, "id" | "createdAt" | "thumbnail"> & { thumbnail: string })
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const valuate = useServerFn(valuateItem);

  const canValuate = photos.length >= 2 && !loading;

  async function onFiles(files: FileList | null) {
    if (!files) return;
    const newPhotos: Photo[] = [];
    for (const f of Array.from(files)) {
      const dataUrl = await compressImage(f);
      newPhotos.push({ id: crypto.randomUUID(), dataUrl });
    }
    setPhotos((p) => [...p, ...newPhotos].slice(0, 6));
  }

  async function onValuate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const r = await valuate({
        data: {
          photos: photos.map((p) => ({ dataUrl: p.dataUrl })),
          context,
          lang,
        },
      });
      setResult({ ...r, thumbnail: photos[0].dataUrl });
    } catch (e) {
      console.error(e);
      setError(t.error);
    } finally {
      setLoading(false);
    }
  }

  function onSave() {
    if (!result) return;
    const v: Valuation = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      title: result.title,
      identification: result.identification,
      priceEurMin: result.priceEurMin,
      priceEurMax: result.priceEurMax,
      priceUsdMin: result.priceUsdMin,
      priceUsdMax: result.priceUsdMax,
      confidence: result.confidence,
      notes: result.notes,
      sources: result.sources,
      thumbnail: result.thumbnail,
    };
    saveValuation(v);
    setSaved(true);
  }

  function reset() {
    setPhotos([]);
    setContext("");
    setResult(null);
    setError(null);
    setSaved(false);
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackgroundGlow />
      <div className="relative mx-auto max-w-xl px-5 pb-24 pt-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-1 ring-primary/40 shadow-glow">
              <img src={lumeIcon.url} alt="Lume" className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gradient-gold">
                {t.appName}
              </h1>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {t.tagline}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LangToggle lang={lang} setLang={setLang} />
            <Link
              to="/history"
              className="glass-crystal flex h-10 w-10 items-center justify-center rounded-full text-primary transition hover:scale-105"
              aria-label={t.viewHistory}
            >
              <History className="h-5 w-5" />
            </Link>
          </div>
        </header>

        {!result && (
          <section className="mt-8">
            <p className="text-sm leading-relaxed text-muted-foreground">{t.subtitle}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => cameraRef.current?.click()}
                className="glass-crystal group flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 transition hover:scale-[1.02]"
              >
                <Camera className="h-7 w-7 text-primary transition group-hover:scale-110" />
                <span className="text-sm font-medium text-foreground">{t.takePhoto}</span>
              </button>
              <button
                onClick={() => galleryRef.current?.click()}
                className="glass-crystal group flex flex-col items-center justify-center gap-2 rounded-2xl px-4 py-6 transition hover:scale-[1.02]"
              >
                <Images className="h-7 w-7 text-primary transition group-hover:scale-110" />
                <span className="text-sm font-medium text-foreground">{t.fromGallery}</span>
              </button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />

            {photos.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {t.photosCount(photos.length)}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {photos.map((p) => (
                    <div
                      key={p.id}
                      className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-primary/30"
                    >
                      <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        onClick={() =>
                          setPhotos((prev) => prev.filter((x) => x.id !== p.id))
                        }
                        className="absolute right-1 top-1 rounded-full bg-background/70 p-1 text-primary backdrop-blur"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={t.context}
              rows={2}
              className="mt-5 w-full resize-none rounded-xl border border-primary/20 bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
            />

            <button
              disabled={!canValuate}
              onClick={onValuate}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow transition disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:scale-[1.01]"
            >
              {loading ? (
                <>
                  <Sparkles className="h-5 w-5 animate-spin" /> {t.valuating}
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" /> {t.valuate}
                </>
              )}
            </button>
            {photos.length < 2 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">{t.minPhotos}</p>
            )}
            {error && (
              <p className="mt-3 text-center text-sm text-destructive">{error}</p>
            )}
            <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
              {t.poweredBy}
            </p>
          </section>
        )}

        {result && (
          <ResultCard
            t={t}
            result={result}
            saved={saved}
            onSave={onSave}
            onReset={reset}
            onHistory={() => navigate({ to: "/history" })}
          />
        )}
      </div>
    </div>
  );
}

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="glass-crystal flex items-center gap-0.5 rounded-full p-1 text-xs">
      <Globe className="ml-1.5 h-3.5 w-3.5 text-primary" />
      {(["es", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 font-semibold uppercase transition ${
            lang === l
              ? "bg-gradient-crystal text-primary-foreground"
              : "text-muted-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function BackgroundGlow() {
  return (
    <>
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,oklch(0.72_0.2_45/40%),transparent_70%)] blur-3xl animate-shimmer" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/3 rounded-full bg-[radial-gradient(ellipse,oklch(0.92_0.18_95/25%),transparent_70%)] blur-3xl" />
    </>
  );
}

function ResultCard({
  t,
  result,
  saved,
  onSave,
  onReset,
  onHistory,
}: {
  t: typeof translations["es"];
  result: Omit<Valuation, "id" | "createdAt">;
  saved: boolean;
  onSave: () => void;
  onReset: () => void;
  onHistory: () => void;
}) {
  const confColor = useMemo(() => {
    if (result.confidence === "high") return "text-primary";
    if (result.confidence === "medium") return "text-accent";
    return "text-muted-foreground";
  }, [result.confidence]);

  return (
    <section className="mt-8 space-y-4">
      <div className="glass-crystal rounded-3xl p-5">
        <div className="flex items-start gap-4">
          <img
            src={result.thumbnail}
            alt=""
            className="h-20 w-20 shrink-0 rounded-xl object-cover ring-1 ring-primary/40"
          />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t.result}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-gradient-gold">
              {result.title}
            </h2>
            <p className={`mt-1 text-xs font-medium uppercase ${confColor}`}>
              {t.confidence}: {result.confidence}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <PriceCard
            label="EUR"
            symbol="€"
            min={result.priceEurMin}
            max={result.priceEurMax}
          />
          <PriceCard
            label="USD"
            symbol="$"
            min={result.priceUsdMin}
            max={result.priceUsdMax}
          />
        </div>

        <div className="mt-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {t.identification}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
            {result.identification}
          </p>
        </div>

        {result.notes && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.notes}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground/80">
              {result.notes}
            </p>
          </div>
        )}

        {result.sources?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.sources}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.sources.map((s, i) => (
                <span
                  key={i}
                  className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onSave}
          disabled={saved}
          className="glass-crystal flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-primary disabled:opacity-70"
        >
          {saved ? (
            <>
              <Check className="h-4 w-4" /> {t.saved}
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> {t.saveHistory}
            </>
          )}
        </button>
        {saved ? (
          <button
            onClick={onHistory}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-crystal px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            <History className="h-4 w-4" /> {t.viewHistory}
          </button>
        ) : (
          <button
            onClick={onReset}
            className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-crystal px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            {t.clear}
          </button>
        )}
      </div>
    </section>
  );
}

function PriceCard({
  label,
  symbol,
  min,
  max,
}: {
  label: string;
  symbol: string;
  min: number;
  max: number;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gradient-gold">
        {symbol}
        {fmt(min)} – {symbol}
        {fmt(max)}
      </p>
    </div>
  );
}
