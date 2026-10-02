import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { paypalMeUrl } from "@/lib/donation";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/gracias")({
  head: () => ({
    meta: [
      { title: "Lume — Gracias" },
      { name: "description", content: "Gracias por apoyar Lume." },
    ],
  }),
  component: Gracias,
});

function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("es");
  useEffect(() => {
    const read = () => setLang((localStorage.getItem("lume:lang") as Lang) || "es");
    read();
    window.addEventListener("lume:lang", read);
    return () => window.removeEventListener("lume:lang", read);
  }, []);
  return lang;
}

function Gracias() {
  const lang = useLang();
  const t = translations[lang].donation;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-10 pt-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gradient-gold">
          <Heart className="h-5 w-5 text-primary" />
          {t.thanksTitle}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t.thanksMissing}</p>
        <a
          href={paypalMeUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow"
        >
          {t.thanksAgain}
        </a>
        <Link to="/" className="mt-6 text-center text-xs font-semibold text-primary">
          {t.backHome}
        </Link>
      </div>
    </div>
  );
}
