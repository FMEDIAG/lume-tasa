export const PAYPAL_HANDLE = "FMEDIAG";
export const PAYPAL_PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile";

export const DONATION_KEY = "lume:donation";

// URL for PayPal webhook (configured in PayPal Developer Dashboard).
// Handled by the worker entry in `src/server.ts` *before* the TanStack Start
// router, so this path is served on both Workers and local dev.
export const PAYPAL_WEBHOOK_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/paypal-webhook`
    : "/paypal-webhook";

export type DonationDraft = {
  username: string;
  email: string;
  amount: number;
  currency: "EUR" | "USD";
  // Custom ID to match webhook callback to this donation session
  customId?: string;
};

export type ConfirmedDonation = {
  id: string;
  amount: number;
  currency: string;
  payerEmail: string;
  payeeEmail: string;
  status: string;
  createTime: string;
  customData?: string;
};

export function paypalMeUrl(amount: number, currency: "EUR" | "USD"): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `https://www.paypal.com/paypalme/${PAYPAL_HANDLE}/${value}${currency}`;
}

// Generate a unique custom ID for tracking
export function generateCustomId(): string {
  return `lume_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export function saveDonation(draft: DonationDraft) {
  sessionStorage.setItem(DONATION_KEY, JSON.stringify(draft));
}

export function readDonation(): DonationDraft | null {
  try {
    const raw = sessionStorage.getItem(DONATION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as DonationDraft;
    if (!data.username || !data.email || !data.amount) return null;
    return data;
  } catch {
    return null;
  }
}

// Clear donation from session storage
export function clearDonation() {
  sessionStorage.removeItem(DONATION_KEY);
}
