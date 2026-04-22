import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, ensureDbReady } from "./db.js";

const app = express();
const PORT = process.env.PORT || 4010;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

const toNum = (value) => Number(value ?? 0);

async function getNextInvoiceNo() {
  const { rows } = await db.query("SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1");
  const latest = rows[0];
  if (!latest?.invoice_no) return "INV-0001";
  const current = Number(String(latest.invoice_no).split("-")[1] || 0);
  return `INV-${String(current + 1).padStart(4, "0")}`;
}

app.get("/api/bootstrap", async (_req, res) => {
  try {
    await ensureDbReady();
    const productsResult = await db.query("SELECT * FROM products ORDER BY description ASC");
    const customersResult = await db.query("SELECT * FROM customers ORDER BY name ASC");
    res.json({
      products: productsResult.rows.map((row) => ({ ...row, price: toNum(row.price) })),
      customers: customersResult.rows,
      nextInvoiceNo: await getNextInvoiceNo(),
      today: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load bootstrap data.", detail: String(error.message) });
  }
});

app.post("/api/products", async (req, res) => {
  const { description, hsnCode, price } = req.body;
  if (!description?.trim()) {
    return res.status(400).json({ message: "Description is required." });
  }
  try {
    await ensureDbReady();
    const created = await db.query(
      `INSERT INTO products (description, hsn_code, price)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [description.trim(), String(hsnCode || "").trim(), Number(price) || 0]
    );
    return res.status(201).json({ ...created.rows[0], price: toNum(created.rows[0].price) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to create product.", detail: String(error.message) });
  }
});

app.put("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { description, hsnCode, price } = req.body;
  try {
    await ensureDbReady();
    const updated = await db.query(
      `UPDATE products
       SET description = $1, hsn_code = $2, price = $3
       WHERE id = $4
       RETURNING *`,
      [description?.trim() || "", String(hsnCode || "").trim(), Number(price) || 0, id]
    );
    if (!updated.rowCount) return res.status(404).json({ message: "Product not found." });
    res.json({ ...updated.rows[0], price: toNum(updated.rows[0].price) });
  } catch (error) {
    res.status(500).json({ message: "Failed to update product.", detail: String(error.message) });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    await ensureDbReady();
    await db.query("DELETE FROM products WHERE id = $1", [Number(req.params.id)]);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: "Failed to delete product.", detail: String(error.message) });
  }
});

app.get("/api/invoices", async (req, res) => {
  const query = String(req.query.q || "").trim();
  try {
    await ensureDbReady();
    const invoices = query
      ? await db.query(
          `SELECT id, invoice_no, invoice_date, customer_name, grand_total
           FROM invoices
           WHERE invoice_no ILIKE $1 OR customer_name ILIKE $1 OR vehicle_no ILIKE $1
           ORDER BY id DESC`,
          [`%${query}%`]
        )
      : await db.query(
          "SELECT id, invoice_no, invoice_date, customer_name, grand_total FROM invoices ORDER BY id DESC"
        );
    res.json(invoices.rows.map((row) => ({ ...row, grand_total: toNum(row.grand_total) })));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoices.", detail: String(error.message) });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    await ensureDbReady();
    const invoice = await db.query("SELECT * FROM invoices WHERE id = $1", [id]);
    if (!invoice.rowCount) return res.status(404).json({ message: "Invoice not found." });
    const items = await db.query(
      "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY item_index ASC",
      [id]
    );
    const row = invoice.rows[0];
    res.json({
      ...row,
      subtotal: toNum(row.subtotal),
      cgst_percent: toNum(row.cgst_percent),
      sgst_percent: toNum(row.sgst_percent),
      igst_percent: toNum(row.igst_percent),
      cgst_amount: toNum(row.cgst_amount),
      sgst_amount: toNum(row.sgst_amount),
      igst_amount: toNum(row.igst_amount),
      grand_total: toNum(row.grand_total),
      items: items.rows.map((item) => ({
        ...item,
        qty: toNum(item.qty),
        rate: toNum(item.rate),
        amount: toNum(item.amount),
      })),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch invoice.", detail: String(error.message) });
  }
});

app.post("/api/invoices", async (req, res) => {
  const payload = req.body;
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!payload.customerName?.trim()) {
    return res.status(400).json({ message: "Customer name is required." });
  }
  if (!items.length) {
    return res.status(400).json({ message: "At least one invoice item is required." });
  }

  const invoiceNo = payload.invoiceNo?.trim() || (await getNextInvoiceNo());
  const client = await db.connect();
  let transactionStarted = false;
  try {
    await ensureDbReady();
    await client.query("BEGIN");
    transactionStarted = true;
    const customerName = payload.customerName.trim();
    const customerAddress = (payload.customerAddress || "").trim();
    const customerPhone = String(payload.customerPhone || "").trim();

    const upsertCustomer = await client.query(
      `INSERT INTO customers (name, address, phone)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE
       SET address = EXCLUDED.address, phone = EXCLUDED.phone
       RETURNING id`,
      [customerName, customerAddress, customerPhone]
    );
    const customerId = upsertCustomer.rows[0].id;

    const invoiceInsert = await client.query(
      `INSERT INTO invoices
      (invoice_no, invoice_date, credit_bill_date, vehicle_no, customer_id, customer_name, customer_address, subtotal, cgst_percent, sgst_percent, igst_percent, cgst_amount, sgst_amount, igst_amount, grand_total, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id`,
      [
        invoiceNo,
        payload.invoiceDate,
        payload.creditBillDate || null,
        String(payload.vehicleNo || "").trim(),
        customerId,
        customerName,
        customerAddress,
        Number(payload.subtotal) || 0,
        Number(payload.cgstPercent) || 0,
        Number(payload.sgstPercent) || 0,
        Number(payload.igstPercent) || 0,
        Number(payload.cgstAmount) || 0,
        Number(payload.sgstAmount) || 0,
        Number(payload.igstAmount) || 0,
        Number(payload.grandTotal) || 0,
        String(payload.notes || "").trim(),
      ]
    );
    const invoiceId = Number(invoiceInsert.rows[0].id);

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await client.query(
        `INSERT INTO invoice_items
         (invoice_id, item_index, description, hsn_code, qty, rate, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          invoiceId,
          index + 1,
          String(item.description || "").trim(),
          String(item.hsnCode || "").trim(),
          Number(item.qty) || 0,
          Number(item.rate) || 0,
          Number(item.amount) || 0,
        ]
      );
    }
    await client.query("COMMIT");
    transactionStarted = false;
    res.status(201).json({ id: invoiceId, invoiceNo });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    res.status(400).json({ message: "Unable to save invoice.", detail: String(error.message) });
  } finally {
    client.release();
  }
});

app.put("/api/invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  const payload = req.body;
  const items = Array.isArray(payload.items) ? payload.items : [];

  const client = await db.connect();
  let transactionStarted = false;
  try {
    await ensureDbReady();
    await client.query("BEGIN");
    transactionStarted = true;
    const invoiceUpdate = await client.query(
      `UPDATE invoices SET
       invoice_no = $1, invoice_date = $2, credit_bill_date = $3, vehicle_no = $4,
       customer_name = $5, customer_address = $6, subtotal = $7, cgst_percent = $8, sgst_percent = $9,
       igst_percent = $10, cgst_amount = $11, sgst_amount = $12, igst_amount = $13, grand_total = $14,
       notes = $15, updated_at = NOW()
       WHERE id = $16`,
      [
        payload.invoiceNo,
        payload.invoiceDate,
        payload.creditBillDate || null,
        String(payload.vehicleNo || "").trim(),
        String(payload.customerName || "").trim(),
        String(payload.customerAddress || "").trim(),
        Number(payload.subtotal) || 0,
        Number(payload.cgstPercent) || 0,
        Number(payload.sgstPercent) || 0,
        Number(payload.igstPercent) || 0,
        Number(payload.cgstAmount) || 0,
        Number(payload.sgstAmount) || 0,
        Number(payload.igstAmount) || 0,
        Number(payload.grandTotal) || 0,
        String(payload.notes || "").trim(),
        id,
      ]
    );
    if (!invoiceUpdate.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ message: "Invoice not found." });
    }

    await client.query("DELETE FROM invoice_items WHERE invoice_id = $1", [id]);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      await client.query(
        `INSERT INTO invoice_items (invoice_id, item_index, description, hsn_code, qty, rate, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          index + 1,
          String(item.description || "").trim(),
          String(item.hsnCode || "").trim(),
          Number(item.qty) || 0,
          Number(item.rate) || 0,
          Number(item.amount) || 0,
        ]
      );
    }
    await client.query("COMMIT");
    transactionStarted = false;
    res.json({ id });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    res.status(400).json({ message: "Unable to update invoice.", detail: String(error.message) });
  } finally {
    client.release();
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

if (process.env.VERCEL !== "1") {
  const server = app.listen(PORT, () => {
    console.log(`KMR billing website running at http://localhost:${PORT}`);
  });

  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE") {
      console.warn(`Port ${PORT} is busy. Retrying on ${Number(PORT) + 1}...`);
      app.listen(Number(PORT) + 1, () => {
        console.log(`KMR billing website running at http://localhost:${Number(PORT) + 1}`);
      });
      return;
    }
    throw error;
  });
}

export default app;
