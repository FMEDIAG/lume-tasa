import { defineEventHandler, readRawBody, getHeader, setResponseStatus } from "h3";
import crypto from "node:crypto";
import { confirmedDonations, findDonationByCustomId } from "~/lib/paypal-webhook";

// PayPal Webhook Event Types we care about
const RELEVANT_EVENTS = [
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
  "PAYMENT.SALE.REVERSED",
  "PAYMENT.SALE.PENDING",
] as const;

async function verifyWebhookSignature(
  request: any,
  payload: string,
  webhookId: string
): Promise<boolean> {
  const transmissionId = getHeader(request, "paypal-transmission-id");
  const transmissionTime = getHeader(request, "paypal-transmission-time");
  const certUrl = getHeader(request, "paypal-cert-url");
  const authAlgo = getHeader(request, "paypal-auth-algo");
  const transmissionSig = getHeader(request, "paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    console.warn("[paypal-webhook] Missing required headers for verification");
    return false;
  }

  const message = `${transmissionId}|${transmissionTime}|${webhookId}|${crypto
    .createHash("sha256")
    .update(payload)
    .digest("hex")}`;

  try {
    const certResponse = await fetch(certUrl);
    if (!certResponse.ok) {
      console.error("[paypal-webhook] Failed to fetch certificate:", certResponse.status);
      return false;
    }
    const certPem = await certResponse.text();

    const verify = crypto.createVerify(authAlgo === "SHA256withRSA" ? "RSA-SHA256" : "RSA-SHA256");
    verify.update(message);
    verify.end();

    const publicKey = crypto.createPublicKey(certPem);
    return verify.verify(publicKey, Buffer.from(transmissionSig, "base64"));
  } catch (err) {
    console.error("[paypal-webhook] Verification error:", err);
    return false;
  }
}

function saveConfirmedDonation(data: {
  id: string;
  amount: number;
  currency: string;
  payerEmail: string;
  payeeEmail: string;
  status: string;
  createTime: string;
  customData?: string;
}) {
  confirmedDonations.set(data.id, data);
  console.log("[paypal-webhook] Confirmed donation saved:", data.id);
}

export default defineEventHandler(async (event) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("[paypal-webhook] PAYPAL_WEBHOOK_ID not configured");
    setResponseStatus(event, 500);
    return { error: "Webhook not configured" };
  }

  const rawBody = await readRawBody(event);
  const payload = rawBody?.toString() || "";

  // Verify signature
  const isValid = await verifyWebhookSignature(event, payload, webhookId);
  if (!isValid) {
    console.warn("[paypal-webhook] Invalid signature");
    setResponseStatus(event, 401);
    return { error: "Invalid signature" };
  }

  let data: any;
  try {
    data = JSON.parse(payload);
  } catch {
    setResponseStatus(event, 400);
    return { error: "Invalid JSON" };
  }

  // Check if it's an event we care about
  if (!RELEVANT_EVENTS.includes(data.event_type)) {
    console.log("[paypal-webhook] Ignoring event:", data.event_type);
    return { received: true, ignored: true };
  }

  console.log("[paypal-webhook] Processing event:", data.event_type, data.id);

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

  return { received: true, processed: true };
});