import express from "express";
import cors from "cors";
import path from "node:path";
import { db } from "./db.js";

const app = express();
const PORT = process.env.PORT || 4010;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.resolve("website", "public")));

function getNextInvoiceNo() {
  const latest = db
    .prepare("SELECT invoice_no FROM invoices ORDER BY id DESC LIMIT 1")
    .get();
  if (!latest?.invoice_no) return "INV-0001";
  const current = Number(String(latest.invoice_no).split("-")[1] || 0);
  return `INV-${String(current + 1).padStart(4, "0")}`;
}

app.get("/api/bootstrap", (_req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY description ASC").all();
  const customers = db.prepare("SELECT * FROM customers ORDER BY name ASC").all();
  res.json({
    products,
    customers,
    nextInvoiceNo: getNextInvoiceNo(),
    today: new Date().toISOString().slice(0, 10),
  });
});

app.post("/api/products", (req, res) => {
  const { description, hsnCode, price } = req.body;
  if (!description?.trim()) {
    return res.status(400).json({ message: "Description is required." });
  }
  const result = db
    .prepare("INSERT INTO products (description, hsn_code, price) VALUES (?, ?, ?)")
    .run(description.trim(), String(hsnCode || "").trim(), Number(price) || 0);
  const created = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(created);
});

app.put("/api/products/:id", (req, res) => {
  const id = Number(req.params.id);
  const { description, hsnCode, price } = req.body;
  db.prepare("UPDATE products SET description = ?, hsn_code = ?, price = ? WHERE id = ?").run(
    description?.trim() || "",
    String(hsnCode || "").trim(),
    Number(price) || 0,
    id
  );
  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  res.json(updated);
});

app.delete("/api/products/:id", (req, res) => {
  db.prepare("DELETE FROM products WHERE id = ?").run(Number(req.params.id));
  res.status(204).send();
});

app.get("/api/invoices", (req, res) => {
  const query = String(req.query.q || "").trim();
  const invoices = query
    ? db
        .prepare(
          `SELECT id, invoice_no, invoice_date, customer_name, grand_total
           FROM invoices
           WHERE invoice_no LIKE ? OR customer_name LIKE ? OR vehicle_no LIKE ?
           ORDER BY id DESC`
        )
        .all(`%${query}%`, `%${query}%`, `%${query}%`)
    : db
        .prepare(
          "SELECT id, invoice_no, invoice_date, customer_name, grand_total FROM invoices ORDER BY id DESC"
        )
        .all();
  res.json(invoices);
});

app.get("/api/invoices/:id", (req, res) => {
  const id = Number(req.params.id);
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id);
  if (!invoice) return res.status(404).json({ message: "Invoice not found." });
  const items = db
    .prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY item_index ASC")
    .all(id);
  res.json({ ...invoice, items });
});

app.post("/api/invoices", (req, res) => {
  const payload = req.body;
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!payload.customerName?.trim()) {
    return res.status(400).json({ message: "Customer name is required." });
  }
  if (!items.length) {
    return res.status(400).json({ message: "At least one invoice item is required." });
  }

  const invoiceNo = payload.invoiceNo?.trim() || getNextInvoiceNo();
  const saveTx = db.transaction(() => {
    const customerName = payload.customerName.trim();
    const customerAddress = (payload.customerAddress || "").trim();
    let customerId = null;

    const customerByName = db.prepare("SELECT id FROM customers WHERE name = ?").get(customerName);
    if (customerByName) {
      customerId = customerByName.id;
      db.prepare("UPDATE customers SET address = ?, phone = ? WHERE id = ?").run(
        customerAddress,
        String(payload.customerPhone || "").trim(),
        customerId
      );
    } else {
      const customerInsert = db
        .prepare("INSERT INTO customers (name, address, phone) VALUES (?, ?, ?)")
        .run(customerName, customerAddress, String(payload.customerPhone || "").trim());
      customerId = customerInsert.lastInsertRowid;
    }

    const invoiceInsert = db
      .prepare(
        `INSERT INTO invoices
        (invoice_no, invoice_date, credit_bill_date, vehicle_no, customer_id, customer_name, customer_address, subtotal, cgst_percent, sgst_percent, igst_percent, cgst_amount, sgst_amount, igst_amount, grand_total, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
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
        String(payload.notes || "").trim()
      );

    const invoiceId = Number(invoiceInsert.lastInsertRowid);
    const itemInsert = db.prepare(
      `INSERT INTO invoice_items
      (invoice_id, item_index, description, hsn_code, qty, rate, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    items.forEach((item, index) => {
      itemInsert.run(
        invoiceId,
        index + 1,
        String(item.description || "").trim(),
        String(item.hsnCode || "").trim(),
        Number(item.qty) || 0,
        Number(item.rate) || 0,
        Number(item.amount) || 0
      );
    });

    return invoiceId;
  });

  try {
    const invoiceId = saveTx();
    res.status(201).json({ id: invoiceId, invoiceNo });
  } catch (error) {
    res.status(400).json({ message: "Unable to save invoice.", detail: String(error.message) });
  }
});

app.put("/api/invoices/:id", (req, res) => {
  const id = Number(req.params.id);
  const payload = req.body;
  const items = Array.isArray(payload.items) ? payload.items : [];

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE invoices SET
       invoice_no = ?, invoice_date = ?, credit_bill_date = ?, vehicle_no = ?,
       customer_name = ?, customer_address = ?, subtotal = ?, cgst_percent = ?, sgst_percent = ?,
       igst_percent = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?, grand_total = ?,
       notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
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
      id
    );

    db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(id);
    const insert = db.prepare(
      `INSERT INTO invoice_items (invoice_id, item_index, description, hsn_code, qty, rate, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    items.forEach((item, index) => {
      insert.run(
        id,
        index + 1,
        String(item.description || "").trim(),
        String(item.hsnCode || "").trim(),
        Number(item.qty) || 0,
        Number(item.rate) || 0,
        Number(item.amount) || 0
      );
    });
  });

  try {
    tx();
    res.json({ id });
  } catch (error) {
    res.status(400).json({ message: "Unable to update invoice.", detail: String(error.message) });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.resolve("website", "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`KMR billing website running at http://localhost:${PORT}`);
});
