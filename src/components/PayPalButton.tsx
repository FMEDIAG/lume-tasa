"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { translations, type Lang } from "@/lib/i18n";
import { generateCustomId, type DonationDraft } from "@/lib/donation";

interface PayPalButtonProps {
  draft: DonationDraft;
  onSuccess: (orderId: string) => void;
  onError: (error: string) => void;
}

declare global {
  interface Window {
    paypal: any;
  }
}

export function PayPalButton({ draft, onSuccess, onError }: PayPalButtonProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Get language for PayPal locale
  const [lang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("lume:lang") as Lang) || "es";
    }
    return "es";
  });

  const t = translations[lang].donation;

  // Load PayPal SDK
  useEffect(() => {
    if (window.paypal) {
      setSdkLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${import.meta.env.VITE_PAYPAL_CLIENT_ID || "sb"}&currency=EUR&locale=${lang === "es" ? "es_ES" : "en_US"}&components=buttons`;
    script.async = true;
    script.onload = () => setSdkLoaded(true);
    script.onerror = () => {
      setSdkError("No se pudo cargar PayPal. Verifica tu conexión.");
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, [lang]);

  // Render PayPal Buttons when SDK is loaded
  useEffect(() => {
    if (!sdkLoaded || !containerRef.current || rendered || !window.paypal) return;

    const customId = generateCustomId();
    // Update draft with customId for tracking
    const draftWithId = { ...draft, customId };

    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          color: "gold",
          shape: "rect",
          label: "pay",
          tagline: false,
        },
        createOrder: async (data: any, actions: any) => {
          setProcessing(true);
          try {
            const order = await actions.order.create({
              purchase_units: [
                {
                  amount: {
                    currency_code: draft.currency,
                    value: draft.amount.toFixed(2),
                  },
                  custom_id: customId, // This will be returned in webhook!
                  description: `Donación a Lume - ${draft.username}`,
                },
              ],
              application_context: {
                brand_name: "Lume",
                locale: lang === "es" ? "es-ES" : "en-US",
                landing_page: "NO_PREFERENCE",
                user_action: "PAY_NOW",
                return_url: `${window.location.origin}/gracias?orderId=TOKEN`,
                cancel_url: `${window.location.origin}/apoyar?cancelled=true`,
              },
            });
            return order;
          } catch (err) {
            console.error("PayPal createOrder error:", err);
            setProcessing(false);
            throw err;
          }
        },
        onApprove: async (data: any, actions: any) => {
          try {
            const details = await actions.order.capture();
            if (details.status === "COMPLETED") {
              onSuccess(details.id);
            } else {
              onError(t.paypalError || "El pago no se completó correctamente");
            }
          } catch (err) {
            console.error("PayPal capture error:", err);
            onError(t.paypalError || "Error al procesar el pago");
          } finally {
            setProcessing(false);
          }
        },
        onCancel: (data: any) => {
          console.log("PayPal cancelled:", data);
          setProcessing(false);
          onError(t.cancelled || "Pago cancelado");
        },
        onError: (err: any) => {
          console.error("PayPal error:", err);
          setProcessing(false);
          onError(t.paypalError || "Error en PayPal");
        },
      })
      .render(containerRef.current);

    setRendered(true);
  }, [sdkLoaded, draft, lang, onSuccess, onError, t, rendered]);

  if (sdkError) {
    return (
      <div className="glass-crystal rounded-2xl p-6 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
        <p className="mt-3 text-sm text-destructive">{sdkError}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Intenta recargar la página o usa el enlace directo a PayPal.
        </p>
      </div>
    );
  }

  if (!sdkLoaded) {
    return (
      <div className="glass-crystal rounded-2xl p-6 text-center">
        <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Cargando PayPal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} />

      {processing && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Procesando pago...</span>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground/70">
        {t.paypalSecureNote}
      </p>
    </div>
  );
}

// Fallback link component for when SDK fails or as alternative
export function PayPalFallbackLink({ draft }: { draft: DonationDraft }) {
  const [lang] = useState<Lang>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("lume:lang") as Lang) || "es";
    }
    return "es";
  });

  const t = translations[lang].donation;
  const { paypalMeUrl } = require("@/lib/donation");
  const url = paypalMeUrl(draft.amount, draft.currency);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-6 py-4 text-base font-semibold text-primary transition hover:bg-primary/10"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
      {t.paypalMeFallback}
    </a>
  );
}