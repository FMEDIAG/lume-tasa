import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { findDonationByCustomId, rowToDonation } from "@/lib/donation-store";

// PayPal Webhook Event Types we care about
export const RELEVANT_EVENTS = [
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
  "PAYMENT.SALE.PENDING",
] as const;

// Input schema for webhook payload (minimal validation)
export const WebhookPayloadSchema = z.object({
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

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// Verify PayPal webhook signature
// See: https://developer.paypal.com/api/rest/webhooks/webhook-event-verify/
export async function verifyWebhookSignature(
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

const DonationStatusSchema = z.object({ customId: z.string() });

// Server function to check donation status from frontend
export const checkDonationStatus = createServerFn({ method: "POST" })
  .validator((data: unknown): z.infer<typeof DonationStatusSchema> =>
    DonationStatusSchema.parse(data),
  )
  .handler(async ({ data }) => {
    const row = findDonationByCustomId(data.customId);
    if (!row) return null;
    return rowToDonation(row);
  });

// Note: the PayPal webhook itself is handled by the worker entry in
// `src/server.ts` (route `/paypal-webhook`), which runs before the TanStack
// Start router so it can read the raw request body needed for signature
// verification. This file only exposes the verification helper and the
// frontend-facing status lookup.