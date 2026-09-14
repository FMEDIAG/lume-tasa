import { useEffect, useState } from "react";
import { Sparkles, Globe, Camera, Layers, Rocket } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";

function useLangState(): [Lang, (l: Lang) => void] {
  const [lang, setLang] = useState<Lang>("es");
  useEffect(() => {
    const read = () => setLang((localStorage.getItem("lume:lang") as Lang) || "es");
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

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="glass-crystal flex items-center gap-0.5 rounded-full p-1 text-xs">
      <Globe className="ml-1.5 h-3.5 w-3.5 text-primary" />
      {(["es", "en"] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded-full px-2.5 py-1 font-semibold uppercase transition ${
            lang === l ? "bg-gradient-crystal text-primary-foreground" : "text-muted-foreground"
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
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,oklch(0.72_0.2_45/40%),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[400px] w-[400px] translate-x-1/3 rounded-full bg-[radial-gradient(ellipse,oklch(0.92_0.18_95/25%),transparent_70%)] blur-3xl" />
    </>
  );
}

/** Clave de localStorage usada para no volver a mostrar la intro tras la primera visita. */
export const INTRO_SEEN_KEY = "lume:introSeen";

export function IntroScreen({ onStart }: { onStart: () => void }) {
  const [lang, setLang] = useLangState();
  const t = translations[lang];

  function handleStart() {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // localStorage no disponible (modo privado, etc.) — igualmente dejamos pasar.
    }
    onStart();
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <BackgroundGlow />
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-10 pt-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-1 ring-primary/40 shadow-glow">
              <img src="/Lume.jpg" alt={t.logoAlt} className="h-full w-full object-cover" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-gradient-gold">
                {t.homeHeading}
              </h1>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {t.tagline}
              </p>
            </div>
          </div>
          <LangToggle lang={lang} setLang={setLang} />
        </header>

        <section className="mt-10">
          <p className="text-sm leading-relaxed text-muted-foreground">{t.intro.lead}</p>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-4 w-4" />
            {t.intro.featuresTitle}
          </h2>
          <ul className="mt-3 space-y-2.5">
            {t.intro.features.map((f, i) => (
              <li
                key={i}
                className="glass-crystal rounded-2xl px-4 py-3 text-sm leading-relaxed text-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-primary">
            <Layers className="h-4 w-4" />
            {t.intro.howTitle}
          </h2>
          <ol className="mt-3 space-y-2.5">
            {t.intro.howSteps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm leading-relaxed text-foreground"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-crystal text-[11px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-10 flex-1" />

        <button
          onClick={handleStart}
          className="glass-crystal group flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-semibold text-primary shadow-glow transition hover:scale-[1.02]"
        >
          <Camera className="h-5 w-5 transition group-hover:scale-110" />
          {t.intro.cta}
          <Rocket className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </button>

        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
          {t.intro.footer}
        </p>
      </div>
    </div>
  );
}
