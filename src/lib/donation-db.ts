import type { D1Database } from "@cloudflare/workers-types";

// Database abstraction layer that works with both:
// - better-sqlite3 (local development)
// - Cloudflare D1 (production)

export type ConfirmedDonationRow = {
  id: string;
  amount: number;
  currency: string;
  payer_email: string;
  payee_email: string;
  status: string;
  create_time: string;
  custom_data: string | null;
  created_at: string;
};

// Detect if we're in Cloudflare Workers environment
const isCloudflare = typeof globalThis !== "undefined" && "caches" in globalThis;

// Local development: use better-sqlite3
let localDb: any = null;
let d1Db: D1Database | null = null;

// Initialize D1 database (called from server entry)
export function initD1(db: D1Database) {
  d1Db = db;
}

// Initialize local SQLite database (for development)
function getLocalDb() {
  if (localDb) return localDb;
  
  // Dynamic import to avoid bundling issues
  const Database = require("better-sqlite3");
  const path = require("node:path");
  const fs = require("node:fs");
  
  const DB_DIR = path.join(process.cwd(), ".data");
  const DB_PATH = path.join(DB_DIR, "donations.db");
  
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  
  localDb = new Database(DB_PATH);
  
  // Create table if not exists
  localDb.exec(`
    CREATE TABLE IF NOT EXISTS confirmed_donations (
      id TEXT PRIMARY KEY,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      payer_email TEXT NOT NULL,
      payee_email TEXT NOT NULL,
      status TEXT NOT NULL,
      create_time TEXT NOT NULL,
      custom_data TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  localDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_custom_data ON confirmed_donations(custom_data)
  `);
  
  return localDb;
}

// Unified database interface
export const db = {
  prepare(sql: string) {
    if (isCloudflare && d1Db) {
      return {
        run: (...params: any[]) => d1Db!.prepare(sql).bind(...params).run(),
        get: (...params: any[]) => d1Db!.prepare(sql).bind(...params).first(),
        all: (...params: any[]) => d1Db!.prepare(sql).bind(...params).all(),
      };
    }
    
    const local = getLocalDb();
    return local.prepare(sql);
  },
  
  exec(sql: string) {
    if (isCloudflare && d1Db) {
      return d1Db.exec(sql);
    }
    const local = getLocalDb();
    return local.exec(sql);
  }
};

export function saveConfirmedDonation(data: {
  id: string;
  amount: number;
  currency: string;
  payerEmail: string;
  payeeEmail: string;
  status: string;
  createTime: string;
  customData?: string;
}) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO confirmed_donations
    (id, amount, currency, payer_email, payee_email, status, create_time, custom_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    data.id,
    data.amount,
    data.currency,
    data.payerEmail,
    data.payeeEmail,
    data.status,
    data.createTime,
    data.customData || null
  );
  console.log("[donation-db] Saved donation:", data.id);
}

export function getConfirmedDonation(id: string) {
  const stmt = db.prepare("SELECT * FROM confirmed_donations WHERE id = ?");
  return stmt.get(id) as ConfirmedDonationRow | undefined;
}

export function getAllConfirmedDonations() {
  const stmt = db.prepare("SELECT * FROM confirmed_donations ORDER BY created_at DESC");
  return stmt.all() as ConfirmedDonationRow[];
}

export function findDonationByCustomId(customId: string) {
  const stmt = db.prepare("SELECT * FROM confirmed_donations WHERE custom_data = ?");
  return stmt.get(customId) as ConfirmedDonationRow | undefined;
}

export function findDonationByPayerEmail(email: string) {
  const stmt = db.prepare("SELECT * FROM confirmed_donations WHERE payer_email = ? ORDER BY created_at DESC");
  return stmt.all(email) as ConfirmedDonationRow[];
}

export function getDonationStats() {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) as total_donations,
      COALESCE(SUM(amount), 0) as total_amount,
      currency
    FROM confirmed_donations
    WHERE status = 'completed'
    GROUP BY currency
  `);
  return stmt.all() as Array<{ total_donations: number; total_amount: number; currency: string }>;
}