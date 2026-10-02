export const PAYPAL_HANDLE = "FMEDIAG";

export function paypalMeUrl(amount?: number, currency?: "EUR" | "USD"): string {
  const baseUrl = `https://www.paypal.com/paypalme/${PAYPAL_HANDLE}`;
  if (amount === undefined || currency === undefined) return baseUrl;
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${baseUrl}/${value}${currency}`;
}
