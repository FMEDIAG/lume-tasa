// Re-export types from donation-db for backward compatibility
export type { ConfirmedDonationRow } from "./donation-db";

// Re-export all database functions
export {
  saveConfirmedDonation,
  getConfirmedDonation,
  getAllConfirmedDonations,
  findDonationByCustomId,
  findDonationByPayerEmail,
  getDonationStats,
} from "./donation-db";

// Type alias for the donation data (used in components)
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

// Helper to convert DB row to ConfirmedDonation
export function rowToDonation(row: {
  id: string;
  amount: number;
  currency: string;
  payer_email: string;
  payee_email: string;
  status: string;
  create_time: string;
  custom_data: string | null;
}): ConfirmedDonation {
  return {
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    payerEmail: row.payer_email,
    payeeEmail: row.payee_email,
    status: row.status,
    createTime: row.create_time,
    customData: row.custom_data || undefined,
  };
}