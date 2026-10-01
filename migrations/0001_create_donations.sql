-- Create confirmed_donations table
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
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_data ON confirmed_donations(custom_data);
CREATE INDEX IF NOT EXISTS idx_payer_email ON confirmed_donations(payer_email);
CREATE INDEX IF NOT EXISTS idx_status ON confirmed_donations(status);