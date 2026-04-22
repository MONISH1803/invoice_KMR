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
  const client = await pool.connect();
  let importedCustomers = 0;
  let importedProducts = 0;

  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        address TEXT DEFAULT '',
        gstin TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        hsn_code TEXT NOT NULL DEFAULT '',
        price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    for (const customer of customers) {
      const name = String(customer?.name || "").trim();
      if (!name) continue;
      const result = await client.query(
        `INSERT INTO customers (name, address, gstin)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE
         SET address = CASE WHEN customers.address = '' THEN EXCLUDED.address ELSE customers.address END,
             gstin = CASE WHEN customers.gstin = '' THEN EXCLUDED.gstin ELSE customers.gstin END
         RETURNING id`,
        [name, String(customer?.address || "").trim(), String(customer?.gstin || "").trim()]
      );
      if (result.rowCount) importedCustomers += 1;
    }

    for (const product of products) {
      const description = String(product?.description || "").trim();
      if (!description) continue;
      const hsnCode = String(product?.hsn_code || "").trim();
      const price = Number(product?.price || 0);
      const existing = await client.query("SELECT id, hsn_code, price FROM products WHERE LOWER(description)=LOWER($1) LIMIT 1", [
        description,
      ]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        const nextHsn = row.hsn_code || hsnCode;
        const nextPrice = Number(row.price) > 0 ? Number(row.price) : price;
        await client.query("UPDATE products SET hsn_code = $1, price = $2 WHERE id = $3", [nextHsn, nextPrice || 0, row.id]);
      } else {
        await client.query("INSERT INTO products (description, hsn_code, price) VALUES ($1, $2, $3)", [
          description,
          hsnCode,
          price || 0,
        ]);
      }
      importedProducts += 1;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`Imported/updated customers: ${importedCustomers}`);
  console.log(`Imported/updated products: ${importedProducts}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
