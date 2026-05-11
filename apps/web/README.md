# Bhuiyan Workforce — Web App

React frontend for the Bhuiyan Workforce management platform. Built with Vite, Tailwind CSS, and Supabase.

## Stack

- **React 18** — UI
- **Vite** — build tool and dev server
- **Tailwind CSS** — styling
- **Supabase JS v2** — auth and database
- **React Router v6** — client-side routing
- **Lucide React** — icons
- **Cloudflare Pages** — hosting (via GitHub Actions)

## Getting started

### 1. Install dependencies

```bash
cd apps/web
pnpm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Then open `.env` and fill in your values:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (Project Settings → API) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key (Project Settings → API) |
| `VITE_API_URL` | Cloudflare Workers API base URL (`http://localhost:8787` for local dev) |

### 3. Run the dev server

```bash
pnpm dev
```

App runs at `http://localhost:5173`.

## Project structure

```
src/
  assets/         Static assets (hero image, icons)
  components/     Shared UI components (GlobalSearch, NotificationBell, Modal, Skeleton)
  context/        AuthContext — session management and profile loading
  hooks/          useAuth (reads from AuthContext)
  layouts/        AppLayout — sidebar nav, header, bottom nav
  lib/            supabase.js, constants.js, utils.js
  pages/          One folder per route (dashboard, passports, candidates, …)
  App.jsx         Route definitions and lazy loading
  main.jsx        Entry point
```

## Pages / routes

| Route | Description |
|---|---|
| `/dashboard` | Overview stats, passport workflow, expiring passports |
| `/passports` | Passport list and workflow status tracker |
| `/visa` | Visa application pipeline |
| `/candidates` | Candidate profiles and pipeline |
| `/agents` | Agent management and commission tracking |
| `/employees` | Internal employee management |
| `/accounts` | Invoices and payments |
| `/expenses` | Expense tracking |
| `/vendors` | Vendor ledger |
| `/loans` | Agent loan management |
| `/payroll` | Agent and employee payroll |
| `/cheques` | Cheque management |
| `/refunds` | Refund tracking |
| `/reports` | Financial and operational reports |
| `/audit-log` | Passport workflow audit trail |
| `/profile` | User profile and settings |

## Role-based access

| Role | Access |
|---|---|
| `owner` / `manager` | Full access to all pages and data |
| `agent` | Dashboard, Candidates, Passports, Accounts (own data only) |

Access is enforced both in the UI (nav items hidden) and at the database level via Supabase Row Level Security policies.

## Building for production

```bash
pnpm build
```

Output goes to `dist/`. Deployed automatically to Cloudflare Pages on push to `main` via GitHub Actions — see `.github/workflows/deploy.yml`.
