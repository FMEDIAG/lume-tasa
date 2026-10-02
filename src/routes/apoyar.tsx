import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { paypalMeUrl } from "@/lib/donation";

export const Route = createFileRoute("/apoyar")({
  head: () => ({
    meta: [
      { title: "Lume — Apoya el proyecto" },
      {
        name: "description",
        content: "Apoya Lume con una donación mediante PayPal.",
      },
    ],
  }),
  component: Apoyar,
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

function Apoyar() {
  const lang = useLang();
  const t = translations[lang].donation;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-10 pt-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gradient-gold">
          <Heart className="h-5 w-5 text-primary" />
          {t.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.lead}</p>
        <a
          href={paypalMeUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow"
        >
          {t.pay}
        </a>

        <Link to="/" className="mt-8 text-center text-xs font-semibold text-primary">
          {t.backHome}
        </Link>
      </div>
    </div>
  );
}