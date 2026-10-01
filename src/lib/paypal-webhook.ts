import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import crypto from "node:crypto";
import {
  saveConfirmedDonation,
  findDonationByCustomId,
  rowToDonation,
  type ConfirmedDonation,
} from "@/lib/donation-store";

// PayPal Webhook Event Types we care about
const RELEVANT_EVENTS = [
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
  "PAYMENT.SALE.PENDING",
] as const;

// Input schema for webhook payload (minimal validation)
const WebhookPayloadSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  create_time: z.string(),
  resource_type: z.string(),
  resource: z.object({
    id: z.string(),
    state: z.string().optional(),
    amount: z
      .object({
        total: z.string(),
        currency: z.string(),
      })
      .optional(),
    payee: z
      .object({
        email: z.string().email().optional(),
        merchant_id: z.string().optional(),
      })
      .optional(),
    payer: z
      .object({
        email: z.string().email().optional(),
        payer_id: z.string().optional(),
      })
      .optional(),
    custom: z.string().optional(),
    invoice_number: z.string().optional(),
  }),
});

type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// Verify PayPal webhook signature
// See: https://developer.paypal.com/api/rest/webhooks/webhook-event-verify/
async function verifyWebhookSignature(
  request: Request,
  payload: string,
  webhookId: string
): Promise<boolean> {
  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionTime = request.headers.get("paypal-transmission-time");
  const certUrl = request.headers.get("paypal-cert-url");
  const authAlgo = request.headers.get("paypal-auth-algo");
  const transmissionSig = request.headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.warn("[paypal-webhook] Missing required headers for verification");
    return false;
  }

  // Construct the message that was signed
  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex")}`;

  try {
    // Fetch PayPal's certificate
    const certResponse = await fetch(certUrl);
    if (!certResponse.ok) {
      console.error("[paypal-webhook] Failed to fetch certificate:", certResponse.status);
      return false;
    }
    const certPem = await certResponse.text();

    // Verify the signature
    const verify = crypto.createVerify(authAlgo === "SHA256withRSA" ? "RSA-SHA256" : "RSA-SHA256");
    verify.update(message);
    verify.end();

    const publicKey = crypto.createPublicKey(certPem);
    const isValid = verify.verify(publicKey, Buffer.from(transmissionSig, "base64"));

    return isValid;
  } catch (err) {
    console.error("[paypal-webhook] Verification error:", err);
    return false;
  }
}

// Server function to check donation status from frontend
export const checkDonationStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ customId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const row = findDonationByCustomId(data.customId);
    if (!row) return null;
    return rowToDonation(row);
  });

// PayPal Webhook handler - using a raw server function
export const handlePayPalWebhook = createServerFn({ method: "POST" })
  .validator((data: unknown) => WebhookPayloadSchema.parse(data))
  .handler(async ({ data, request }) => {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      console.error("[paypal-webhook] PAYPAL_WEBHOOK_ID not configured");
      setResponseStatus(500);
      throw new Error("Webhook not configured");
    }

    // Get raw body for signature verification
    const rawBody = await request.text();

    // Verify signature
    const isValid = await verifyWebhookSignature(request, rawBody, webhookId);
    if (!isValid) {
      console.warn("[paypal-webhook] Invalid signature");
      setResponseStatus(401);
      throw new Error("Invalid signature");
    }

    // Check if it's an event we care about
    if (!RELEVANT_EVENTS.includes(data.event_type as any)) {
      console.log("[paypal-webhook] Ignoring event:", data.event_type);
      return { received: true, ignored: true };
    }

    console.log("[paypal-webhook] Processing event:", data.event_type, data.id);

    const resource = data.resource;
    const amount = resource.amount ? parseFloat(resource.amount.total) : 0;
    const currency = resource.amount?.currency || "EUR";

    // Extract custom ID from PayPal resource (custom field or invoice_number)
    const customId = resource.custom || resource.invoice_number;

    // Save the confirmed donation to database
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

    return { received: true, processed: true };
  });