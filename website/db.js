import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it to your Supabase/Postgres connection string.");
}

const globalForDb = globalThis;
if (!globalForDb.__kmrPgPool) {
  globalForDb.__kmrPgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });
}

export const db = globalForDb.__kmrPgPool;

let initialized = false;

export async function ensureDbReady() {
  if (initialized) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      description TEXT NOT NULL,
      hsn_code TEXT NOT NULL DEFAULT '',
      price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id BIGSERIAL PRIMARY KEY,
      invoice_no TEXT NOT NULL UNIQUE,
      invoice_date DATE NOT NULL,
      credit_bill_date DATE,
      vehicle_no TEXT DEFAULT '',
      customer_id BIGINT REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_address TEXT DEFAULT '',
      subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
      cgst_percent NUMERIC(7, 2) NOT NULL DEFAULT 9,
      sgst_percent NUMERIC(7, 2) NOT NULL DEFAULT 9,
      igst_percent NUMERIC(7, 2) NOT NULL DEFAULT 0,
      cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id BIGSERIAL PRIMARY KEY,
      invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      item_index INTEGER NOT NULL,
      description TEXT NOT NULL,
      hsn_code TEXT DEFAULT '',
      qty NUMERIC(12, 2) NOT NULL DEFAULT 1,
      rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
      amount NUMERIC(12, 2) NOT NULL DEFAULT 0
    );
  `);

  const productCount = await db.query("SELECT COUNT(*)::int AS count FROM products");
  if (!productCount.rows[0].count) {
    await db.query(
      `INSERT INTO products (description, hsn_code, price)
       VALUES
       ($1, $2, $3),
       ($4, $5, $6),
       ($7, $8, $9)`,
      ["Brake Pads", "8708", 650, "Engine Oil 1L", "2710", 520, "Air Filter", "8421", 220]
    );
  }

  initialized = true;
}
