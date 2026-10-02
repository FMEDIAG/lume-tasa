export const PAYPAL_HANDLE = "FMEDIAG";

export function paypalMeUrl(amount?: number, currency?: "EUR" | "USD"): string {
  const baseUrl = `https://www.paypal.com/paypalme/${PAYPAL_HANDLE}`;
  if (amount === undefined || currency === undefined) return baseUrl;
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${baseUrl}/${value}${currency}`;
}

export function openPayPalMe(amount?: number, currency?: "EUR" | "USD"): void {
  const url = paypalMeUrl(amount, currency);
  const width = 600;
  const height = 700;
  const left = window.screenX + (window.innerWidth - width) / 2;
  const top = window.screenY + (window.innerHeight - height) / 2;
  window.open(
    url,
    "paypalme",
    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`,
  );
}
