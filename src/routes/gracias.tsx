import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Heart, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { paypalMeUrl, readDonation, type DonationDraft, type ConfirmedDonation } from "@/lib/donation";
import { checkDonationStatus } from "@/lib/paypal-webhook";

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

function StatusBadge({ status }: { status: "pending" | "confirmed" | "failed" | null }) {
  if (!status) return null;
  const config = {
    pending: { icon: Clock, color: "text-amber-400 bg-amber-400/10", label: "Pendiente" },
    confirmed: { icon: CheckCircle, color: "text-emerald-400 bg-emerald-400/10", label: "Confirmada" },
    failed: { icon: AlertCircle, color: "text-red-400 bg-red-400/10", label: "Fallida" },
  }[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function Gracias() {
  const lang = useLang();
  const t = translations[lang].donation;
  const [draft, setDraft] = useState<DonationDraft | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedDonation | null>(null);
  const [checking, setChecking] = useState(false);

  const checkStatus = useServerFn(checkDonationStatus);

  useEffect(() => {
    const donation = readDonation();
    setDraft(donation);
    if (donation?.customId) {
      setChecking(true);
      checkStatus({ data: { customId: donation.customId } })
        .then((result) => {
          if (result) setConfirmed(result);
        })
        .catch(() => {})
        .finally(() => setChecking(false));
    }
  }, [checkStatus]);

  // Determine overall status
  let status: "pending" | "confirmed" | "failed" | null = "pending";
  if (confirmed) {
    if (confirmed.status === "COMPLETED") status = "confirmed";
    else if (["DENIED", "REFUNDED", "REVERSED"].includes(confirmed.status)) status = "failed";
  }

  const amountStr = draft ? formatAmount(draft) : "";
  const displayName = draft?.username || confirmed?.payerEmail || "Gracias";

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-10 pt-8">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gradient-gold">
          <Heart className="h-5 w-5 text-primary" />
          {t.thanksTitle}
        </h1>

        <StatusBadge status={status} />

        {draft ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t.thanksBody(displayName, amountStr)}
            </p>

            {status === "confirmed" && (
              <p className="mt-3 text-sm text-emerald-400">
                ✓ Tu donación de {amountStr} ha sido confirmada. ¡Muchas gracias por tu apoyo!
              </p>
            )}

            {status === "failed" && (
              <p className="mt-3 text-sm text-red-400">
                La donación no se pudo completar. Puedes intentarlo de nuevo más abajo.
              </p>
            )}

            {status === "pending" && (
              <p className="mt-3 text-sm text-amber-400">
                {checking ? "Verificando estado..." : "Tu donación está pendiente de confirmación. PayPal nos notificará cuando se complete."}
              </p>
            )}

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
