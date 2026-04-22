import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "billing.db");
export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  hsn_code TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  invoice_date TEXT NOT NULL,
  credit_bill_date TEXT,
  vehicle_no TEXT DEFAULT '',
  customer_id INTEGER,
  customer_name TEXT NOT NULL,
  customer_address TEXT DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  cgst_percent REAL NOT NULL DEFAULT 9,
  sgst_percent REAL NOT NULL DEFAULT 9,
  igst_percent REAL NOT NULL DEFAULT 0,
  cgst_amount REAL NOT NULL DEFAULT 0,
  sgst_amount REAL NOT NULL DEFAULT 0,
  igst_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  description TEXT NOT NULL,
  hsn_code TEXT DEFAULT '',
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);
`);

const countProducts = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
if (!countProducts) {
  const insertProduct = db.prepare(
    "INSERT INTO products (description, hsn_code, price) VALUES (?, ?, ?)"
  );
  insertProduct.run("Brake Pads", "8708", 650);
  insertProduct.run("Engine Oil 1L", "2710", 520);
  insertProduct.run("Air Filter", "8421", 220);
}
