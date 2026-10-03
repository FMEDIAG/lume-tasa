const configuredDonationUrl = import.meta.env.VITE_PAYPAL_DONATION_URL?.trim();

export const PAYPAL_DONATION_URL =
  configuredDonationUrl &&
  /^https:\/\/www\.paypal\.com\/(?:donate|checkoutnow|ncp\/payment)(?:\/|\?|$)/i.test(
    configuredDonationUrl,
  )
    ? configuredDonationUrl
    : null;
