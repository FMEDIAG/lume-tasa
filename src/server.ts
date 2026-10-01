import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { saveConfirmedDonation } from "./lib/donation-store";
import { initD1 } from "./lib/donation-db";

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
      const webhookId = process.env.PAYPAL_WEBHOOK_ID;
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

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Initialize D1 database if available (Cloudflare Workers)
    if (env && typeof env === "object" && "DB" in env) {
      initD1((env as any).DB);
    }

    // Check for webhook route first
    const webhookResponse = await handleWebhookRoute(request);
    if (webhookResponse) return webhookResponse;

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
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
