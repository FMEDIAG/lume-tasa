import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { paypalMeUrl, PAYPAL_PLAY_STORE, saveDonation } from "@/lib/donation";

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

const PRESETS = [3, 5, 10];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const currency = lang === "es" ? "EUR" : "USD";
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [noAccount, setNoAccount] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<number | "custom">(5);
  const [custom, setCustom] = useState("");

  function connect(e: React.FormEvent) {
    e.preventDefault();
    const user = username.trim();
    const mail = email.trim();
    if (user.length < 2) {
      setError(t.invalidUser);
      return;
    }
    if (!EMAIL_RE.test(mail)) {
      setError(t.invalidEmail);
      return;
    }
    setError(null);
    setConnected(true);
  }

  function amountValue(): number | null {
    if (preset !== "custom") return preset;
    const n = Number(custom.replace(",", "."));
    if (!Number.isFinite(n) || n < 1 || n > 10000) return null;
    return Math.round(n * 100) / 100;
  }

  function pay() {
    const amount = amountValue();
    if (!amount) return;
    const draft = { username: username.trim(), email: email.trim(), amount, currency } as const;
    saveDonation(draft);
    window.open(paypalMeUrl(amount, currency), "_blank", "noopener,noreferrer");
    navigate({ to: "/gracias" });
  }

  const symbol = currency === "EUR" ? "€" : "$";
  const ready = amountValue() != null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-10 pt-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gradient-gold">
          <Heart className="h-5 w-5 text-primary" />
          {t.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.lead}</p>

        {!connected && (
          <form onSubmit={connect} className="mt-6 space-y-3">
            <label className="block text-xs font-semibold text-primary">
              {t.username}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                disabled={noAccount}
                className="mt-1 w-full rounded-xl border border-primary/20 bg-input px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
              />
            </label>
            <label className="block text-xs font-semibold text-primary">
              {t.email}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={noAccount}
                className="mt-1 w-full rounded-xl border border-primary/20 bg-input px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={noAccount}
                onChange={(e) => {
                  setNoAccount(e.target.checked);
                  setError(null);
                }}
              />
              {t.noAccount}
            </label>
            {noAccount && (
              <div className="glass-crystal rounded-2xl px-4 py-4 text-sm">
                <p className="text-muted-foreground">{t.noAccountHelp}</p>
                <a
                  href={PAYPAL_PLAY_STORE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex rounded-full bg-gradient-crystal px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  {t.playStore}
                </a>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!noAccount && (
              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow"
              >
                {t.continue}
              </button>
            )}
          </form>
        )}

        {connected && (
          <section className="mt-6">
            <p className="text-sm text-foreground">
              {username.trim()} · {email.trim()}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t.balanceNote}</p>
            <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-primary">
              {t.chooseAmount}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setPreset(amount)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    preset === amount
                      ? "bg-gradient-crystal text-primary-foreground"
                      : "glass-crystal text-primary"
                  }`}
                >
                  {currency === "EUR" ? `${amount}${symbol}` : `${symbol}${amount}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  preset === "custom"
                    ? "bg-gradient-crystal text-primary-foreground"
                    : "glass-crystal text-primary"
                }`}
              >
                {t.customAmount}
              </button>
            </div>
            {preset === "custom" && (
              <input
                inputMode="decimal"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder={currency === "EUR" ? "15" : "15"}
                className="mt-3 w-full rounded-xl border border-primary/20 bg-input px-4 py-3 text-sm"
              />
            )}
            <button
              type="button"
              disabled={!ready}
              onClick={pay}
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {t.pay}
            </button>
          </section>
        )}

        <Link to="/" className="mt-8 text-center text-xs font-semibold text-primary">
          {t.backHome}
        </Link>
      </div>
    </div>
  );
}
