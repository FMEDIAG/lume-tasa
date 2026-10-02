import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Globe, Heart, ShieldCheck } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";

// Usuario receptor de las donaciones (enlace paypal.me).
const PAYPAL_ME_USER = "fmediag";

const DONATION_KEY = "lume:donation";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile";

export const Route = createFileRoute("/apoyar")({
  validateSearch: (search: Record<string, unknown>) => ({
    step: typeof search.step === "string" ? search.step : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Apoya Lume — Support Lume" },
      {
        name: "description",
        content: "Apoya el proyecto Lume con una donación segura por PayPal. Support the Lume project with a PayPal donation.",
      },
      { property: "og:title", content: "Apoya Lume — Support Lume" },
      {
        property: "og:description",
        content: "Apoya el proyecto Lume con una donación segura por PayPal. Support the Lume project with a PayPal donation.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ApoyarPage,
});

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

function ApoyarPage() {
  const [lang, setLang] = useLangState();
  const t = translations[lang];
  const step = Route.useSearch().step;

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-4 py-8">
      <BackgroundGlow />
      <div className="relative mx-auto max-w-md">
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="glass-crystal flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t.back}
          </Link>
          <LangToggle lang={lang} setLang={setLang} />
        </div>

        {step === "gracias" ? <Thanks t={t} /> : <DonateFlow t={t} />}
      </div>
    </div>
  );
}

type DonateT = (typeof translations)["es"] | (typeof translations)["en"];

function DonateFlow({ t }: { t: DonateT }) {
  const [stage, setStage] = useState<"login" | "thanks">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [userError, setUserError] = useState(false);
  const [emailError, setEmailError] = useState(false);

  const donate = () => {
    const uBad = name.trim().length === 0;
    const eBad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    setUserError(uBad);
    setEmailError(eBad);
    if (uBad || eBad) return;
    try {
      sessionStorage.setItem(DONATION_KEY, JSON.stringify({ name: name.trim() }));
    } catch {
      // sessionStorage no disponible: seguimos sin persistir la donación en curso.
    }
    window.open(`https://paypal.me/${PAYPAL_ME_USER}`, "_blank", "noopener");
    setStage("thanks");
  };

  if (stage === "thanks") return <Thanks t={t} />;

  return (
    <section className="mt-6">
      <div className="glass-crystal rounded-3xl p-5">
        <div className="flex items-center gap-2">
          <Heart className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-gradient-gold">{t.donation.title}</h1>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{t.donation.lead}</p>

        <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="pp-user" className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.donation.username}
              </label>
              <input
                id="pp-user"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (e.target.value.trim()) setUserError(false);
                }}
                autoComplete="username"
                className={`mt-1.5 w-full rounded-xl border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 ${
                  userError ? "border-destructive/60 focus:border-destructive" : "border-primary/20 focus:border-primary/60"
                }`}
              />
              {userError && <p className="mt-1 text-xs text-destructive">{t.donation.invalidUser}</p>}
            </div>
            <div>
              <label htmlFor="pp-email" className="text-xs uppercase tracking-wider text-muted-foreground">
                {t.donation.email}
              </label>
              <input
                id="pp-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value.trim())) setEmailError(false);
                }}
                autoComplete="email"
                className={`mt-1.5 w-full rounded-xl border bg-input px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 ${
                  emailError ? "border-destructive/60 focus:border-destructive" : "border-primary/20 focus:border-primary/60"
                }`}
              />
              {emailError && <p className="mt-1 text-xs text-destructive">{t.donation.invalidEmail}</p>}
            </div>
            <button
              onClick={donate}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-crystal px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-glow transition"
            >
              <Heart className="h-4 w-4" /> {t.donation.pay}
            </button>
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              {t.donation.balanceNote}
            </p>
            <NoPayPal t={t} />
          </div>
      </div>
    </section>
  );
}

function NoPayPal({ t }: { t: DonateT }) {
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5">
      <p className="text-sm font-semibold text-foreground/90">{t.donation.noAccount}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.donation.noAccountHelp}</p>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary transition hover:shadow-glow"
      >
        {t.donation.playStore}
      </a>
    </div>
  );
}

function Thanks({ t }: { t: DonateT }) {
  let donation: { name?: string } | null = null;
  try {
    donation = JSON.parse(sessionStorage.getItem(DONATION_KEY) || "null");
  } catch {
    donation = null;
  }

  if (!donation?.name) {
    return (
      <section className="mt-6">
        <div className="glass-crystal rounded-3xl p-5 text-center">
          <p className="text-sm text-foreground/80">{t.donation.thanksMissing}</p>
          <Link
            to="/apoyar"
            search={{ step: undefined }}
            className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-gradient-crystal px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            <Heart className="h-4 w-4" /> {t.donate}
          </Link>
        </div>
      </section>
    );
  }

  const reopen = () => {
    window.open(`https://paypal.me/${PAYPAL_ME_USER}`, "_blank", "noopener");
  };

  return (
    <section className="mt-6">
      <div className="glass-crystal rounded-3xl p-5 text-center">
        <Heart className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 text-lg font-semibold text-gradient-gold">{t.donation.thanksTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">
          {t.donation.thanksBody(donation.name)}
        </p>
        <button
          onClick={reopen}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-crystal px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-glow transition"
        >
          <Heart className="h-4 w-4" /> {t.donation.thanksAgain}
        </button>
        <Link
          to="/"
          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl glass-crystal px-6 py-3 text-sm font-semibold text-primary"
        >
          {t.donation.backHome}
        </Link>
      </div>
    </section>
  );
}
