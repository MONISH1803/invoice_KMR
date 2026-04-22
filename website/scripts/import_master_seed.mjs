import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const seedPath = path.join(__dirname, "..", "seeds", "master_seed.json");

function pickDbUrl() {
  const keys = [
    "DATABASE_URL",
    "DATABASE_URL_URL",
    "POSTGRES_URL",
    "POSTGRES_PRISMA_URL",
    "SUPABASE_DB_URL",
    "STORAGE_URL",
  ];
  for (const key of keys) {
    const value = process.env[key];
    if (value && !value.includes("[YOUR-PASSWORD]")) return value;
  }
  return null;
}

function getPool(dbUrl) {
  const relaxedSsl =
    dbUrl.includes("supabase.com") || dbUrl.includes("supabase.co") || dbUrl.includes("pooler");
  const connectionString = relaxedSsl ? dbUrl.replace("sslmode=require", "sslmode=no-verify") : dbUrl;
  return new Pool({
    connectionString,
    ssl: relaxedSsl ? { rejectUnauthorized: false } : undefined,
  });
}

async function main() {
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file missing: ${seedPath}`);
  }
  const dbUrl = pickDbUrl();
  if (!dbUrl) {
    throw new Error("DATABASE_URL is missing. Set it and retry.");
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  const customers = Array.isArray(seed.customers) ? seed.customers : [];
  const products = Array.isArray(seed.products) ? seed.products : [];
  const pool = getPool(dbUrl);
  let importedCustomers = 0;
  let importedProducts = 0;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        address TEXT DEFAULT '',
        gstin TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        hsn_code TEXT NOT NULL DEFAULT '',
        price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const cleanedCustomers = customers
      .map((c) => ({
        name: String(c?.name || "").trim(),
        address: String(c?.address || "").trim(),
        gstin: String(c?.gstin || "").trim(),
      }))
      .filter((c) => c.name);
    const cleanedProducts = products
      .map((p) => ({
        description: String(p?.description || "").trim(),
        hsn_code: String(p?.hsn_code || "").trim(),
        price: Number(p?.price || 0) || 0,
      }))
      .filter((p) => p.description);

    let i = 0;
    for (const customer of cleanedCustomers) {
      await pool.query(
        `INSERT INTO customers (name, address, gstin)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE
         SET address = CASE WHEN customers.address = '' THEN EXCLUDED.address ELSE customers.address END,
             gstin = CASE WHEN customers.gstin = '' THEN EXCLUDED.gstin ELSE customers.gstin END`,
        [customer.name, customer.address, customer.gstin]
      );
      importedCustomers += 1;
      i += 1;
      if (i % 50 === 0) {
        console.log(`Customer upserts: ${i}/${cleanedCustomers.length}`);
      }
    }

    let j = 0;
    for (const product of cleanedProducts) {
      await pool.query(
        `INSERT INTO products (description, hsn_code, price)
         SELECT $1, $2, $3
         WHERE NOT EXISTS (
           SELECT 1 FROM products p WHERE LOWER(p.description) = LOWER($1)
         )`,
        [product.description, product.hsn_code, product.price]
      );
      await pool.query(
        `UPDATE products
         SET
           hsn_code = CASE WHEN COALESCE(hsn_code, '') = '' THEN $2 ELSE hsn_code END,
           price = CASE WHEN COALESCE(price, 0) = 0 THEN $3 ELSE price END
         WHERE LOWER(description) = LOWER($1)`,
        [product.description, product.hsn_code, product.price]
      );
      importedProducts += 1;
      j += 1;
      if (j % 200 === 0) {
        console.log(`Product upserts: ${j}/${cleanedProducts.length}`);
      }
    }
  } finally {
    await pool.end();
  }

  console.log(`Imported/updated customers: ${importedCustomers}`);
  console.log(`Imported/updated products: ${importedProducts}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
