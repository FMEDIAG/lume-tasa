import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { paypalMeUrl, readDonation, type DonationDraft } from "@/lib/donation";

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

function formatAmount(draft: DonationDraft) {
  return draft.currency === "EUR" ? `${draft.amount}€` : `$${draft.amount}`;
}

function Gracias() {
  const lang = useLang();
  const t = translations[lang].donation;
  const [draft, setDraft] = useState<DonationDraft | null>(null);

  useEffect(() => {
    setDraft(readDonation());
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-10 pt-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gradient-gold">
          <Heart className="h-5 w-5 text-primary" />
          {t.thanksTitle}
        </h1>
        {draft ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t.thanksBody(draft.username, formatAmount(draft))}
            </p>
            <a
              href={paypalMeUrl(draft.amount, draft.currency)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 flex w-full items-center justify-center rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow"
            >
              {t.thanksAgain}
            </a>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t.thanksMissing}</p>
        )}
        <Link to="/apoyar" className="mt-6 text-center text-xs font-semibold text-primary">
          {translations[lang].donate}
        </Link>
        <Link to="/" className="mt-3 text-center text-xs font-semibold text-primary">
          {t.backHome}
        </Link>
      </div>
    </div>
  );
}
