import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, ArrowLeft, Loader2, AlertCircle } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { PAYPAL_PLAY_STORE, saveDonation, generateCustomId, type DonationDraft } from "@/lib/donation";
import { PayPalButton, PayPalFallbackLink } from "@/components/PayPalButton";

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
  const [draft, setDraft] = useState<DonationDraft | null>(null);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

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

  function prepareDonation() {
    const amount = amountValue();
    if (!amount) return;
    const customId = generateCustomId();
    const newDraft: DonationDraft = {
      username: username.trim(),
      email: email.trim(),
      amount,
      currency,
      customId,
    };
    setDraft(newDraft);
    saveDonation(newDraft);
    setPaypalError(null);
  }

  function handlePayPalSuccess(orderId: string) {
    setProcessing(true);
    // Navigate to gracias page, orderId will be available for verification
    navigate({ to: "/gracias", search: { orderId } });
  }

  function handlePayPalError(err: string) {
    setPaypalError(err);
    setProcessing(false);
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

        {connected && !draft && (
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
              onClick={prepareDonation}
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-gradient-crystal px-6 py-4 text-base font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              {t.pay}
            </button>
          </section>
        )}

        {draft && (
          <section className="mt-6 space-y-4">
            <div className="glass-crystal rounded-2xl p-4">
              <p className="text-sm text-foreground">
                {draft.username} · {draft.email}
              </p>
              <p className="mt-2 text-lg font-semibold text-gradient-gold">
                {symbol}{draft.amount.toFixed(2)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">{t.balanceNote}</p>
            </div>

            <PayPalButton
              draft={draft}
              onSuccess={handlePayPalSuccess}
              onError={handlePayPalError}
            />

            {paypalError && (
              <div className="glass-crystal rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{paypalError}</span>
                </div>
                <div className="mt-3">
                  <PayPalFallbackLink draft={draft} />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setPreset(5);
                setCustom("");
                setPaypalError(null);
              }}
              className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Cambiar importe
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