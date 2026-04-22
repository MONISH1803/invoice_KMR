# KMR Billing Website

This folder contains a full billing web app with persistent Supabase/Postgres storage.

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
set DATABASE_URL=postgresql://postgres:password@db.your-project-ref.supabase.co:5432/postgres?sslmode=require
npm run dev
```

Open: `http://localhost:4010`

## Storage

- Set `DATABASE_URL` in local environment and in Vercel project settings.
- The app auto-creates required tables on startup.

### Supabase connection string

Use the direct Postgres connection URL from Supabase:

`postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require`
