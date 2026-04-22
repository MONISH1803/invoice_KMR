# KMR Billing Website

This folder contains a full billing web app with persistent SQLite storage.

## Features

- Create, save, edit, and re-open invoices
- Product master with reusable rates + HSN code
- Customer auto-fill from saved history
- Tax fields (CGST/SGST/IGST) with live totals
- Invoice history search
- A4 print-ready invoice format

## Run locally

```bash
cd website
npm install
npm run dev
```

Open: `http://localhost:4010`

## Storage

Database file is created at `website/data/billing.db`.
