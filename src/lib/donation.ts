export const PAYPAL_HANDLE = "FMEDIAG";
export const PAYPAL_PLAY_STORE =
  "https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile";

export const DONATION_KEY = "lume:donation";

export type DonationDraft = {
  username: string;
  email: string;
  amount: number;
  currency: "EUR" | "USD";
};

export function paypalMeUrl(amount: number, currency: "EUR" | "USD"): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `https://www.paypal.com/paypalme/${PAYPAL_HANDLE}/${value}${currency}`;
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
