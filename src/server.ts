import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { saveConfirmedDonation } from "./lib/donation-store";
import { initD1 } from "./lib/donation-db";
import { resolveCloudflareEnv, cfSecret } from "./lib/cf-env";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry")
      .then((m) => (m.default ?? m) as ServerEntry)
      .catch((err) => {
        serverEntryPromise = undefined;
        throw err;
      });
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// PayPal Webhook Event Types we care about
const RELEVANT_EVENTS = [
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
  "PAYMENT.SALE.PENDING",
] as const;

// Handle PayPal webhook before TanStack Start router
async function handleWebhookRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/paypal-webhook" || url.pathname === "/api/paypal-webhook") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }
    try {
      const rawBody = await request.text();
      const webhookId = cfSecret("PAYPAL_WEBHOOK_ID", request);
      if (!webhookId) {
        return new Response(JSON.stringify({ error: "Webhook not configured" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      let data: any;
      try {
        data = JSON.parse(rawBody);
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      if (!RELEVANT_EVENTS.includes(data.event_type)) {
        return new Response(JSON.stringify({ received: true, ignored: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const resource = data.resource;
      const amount = resource.amount ? parseFloat(resource.amount.total) : 0;
      const currency = resource.amount?.currency || "EUR";
      const customId = resource.custom || resource.invoice_number;

      saveConfirmedDonation({
        id: data.id,
        amount,
        currency,
        payerEmail: resource.payer?.email || "unknown",
        payeeEmail: resource.payee?.email || "unknown",
        status: resource.state || data.event_type,
        createTime: data.create_time,
        customData: customId,
      });

      console.log("[paypal-webhook] Processed:", data.event_type, data.id);

      return new Response(JSON.stringify({ received: true, processed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      console.error("[paypal-webhook] Error:", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }
  return null;
}

/**
 * AI connectivity probe: makes one minimal, real request against the
 * configured provider so we can see the upstream status code and body
 * (a bad key, no credit, wrong model...). Never echoes the key itself.
 */
async function handleAiProbeRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/ai-probe") return null;

  const which = url.searchParams.get("provider") ?? "auto";
  const xaiKey = cfSecret("XAI_API_KEY", request);
  const lovableKey = cfSecret("LOVABLE_API_KEY", request);

  const probe = async (
    label: string,
    endpoint: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ) => {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      return { label, endpoint, status: res.status, ok: res.ok, body: text.slice(0, 500) };
    } catch (err) {
      return {
        label,
        endpoint,
        status: 0,
        ok: false,
        body: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      };
    }
  };

  const results = [];
  if ((which === "auto" || which === "xai") && xaiKey) {
    results.push(
      await probe("xai", "https://api.x.ai/v1/chat/completions", { Authorization: `Bearer ${xaiKey}` }, {
        model: "grok-4.5",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    );
  }
  if ((which === "auto" || which === "lovable") && lovableKey) {
    results.push(
      await probe("lovable", "https://ai.gateway.lovable.dev/v1/chat/completions", { "Lovable-API-Key": lovableKey }, {
        model: "google/gemini-3.6-flash",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    );
  }

  return new Response(
    JSON.stringify(
      {
        probed: results.map((r) => r.label),
        configured: { XAI_API_KEY: !!xaiKey, LOVABLE_API_KEY: !!lovableKey },
        results,
      },
      null,
      2,
    ),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

/**
 * Lightweight diagnostics endpoint: reports whether the expected bindings and
 * secrets are present (never their values).
 */
function handleHealthRoute(request: Request, env: Record<string, unknown> | undefined): Response | null {
  const url = new URL(request.url);
  if (url.pathname !== "/api/health") return null;

  // Reports only metadata (presence + length), never the secret value itself.
  const describe = (name: string) => {
    const value = env?.[name];
    return {
      name,
      present: typeof value === "string" && value.length > 0,
      length: typeof value === "string" ? value.length : 0,
      type: typeof value,
    };
  };

  return new Response(
    JSON.stringify(
      {
        ok: true,
        envResolved: !!env,
        bindingNames: env ? Object.keys(env).sort() : [],
        d1: !!env?.DB,
        secrets: ["XAI_API_KEY", "LOVABLE_API_KEY", "PAYPAL_WEBHOOK_ID", "VITE_PAYPAL_CLIENT_ID"].map(describe),
      },
      null,
      2,
    ),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

export default {
  async fetch(request: Request, envArg: unknown, ctx: unknown) {
    // On Workers the real bindings live on `globalThis.__env__` (set by Nitro)
    // or `request.runtime.cloudflare.env`; the `env` argument is undefined here
    // because TanStack Start forwards only the Request to this entry.
    const env = resolveCloudflareEnv(request) ?? (envArg as Record<string, unknown> | undefined);

    // Initialize D1 database if available (Cloudflare Workers)
    if (env?.DB) {
      initD1(env.DB as never);
    }

    // Diagnostics
    const healthResponse = handleHealthRoute(request, env);
    if (healthResponse) return healthResponse;

    const aiProbeResponse = await handleAiProbeRoute(request);
    if (aiProbeResponse) return aiProbeResponse;

    // Check for webhook route
    const webhookResponse = await handleWebhookRoute(request);
    if (webhookResponse) return webhookResponse;

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, envArg, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};