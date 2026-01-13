# ChargeDrift - Recurring Charge Drift Detector



https://chargedrift.vercel.app/

A Next.js 14 web application that connects to your bank via Plaid, detects recurring charges (subscriptions, memberships, etc.), and identifies when merchants have increased their prices over time.

**The app answers one question:**
> "Which merchants are charging me more than they used to?"

## Features

- 🔐 **Email/Password Authentication** via Supabase
- 🏦 **Plaid Link Integration** for secure bank connections
- 📄 **CSV Import** - Upload bank transaction exports as alternative to Plaid
- 🔄 **Automatic Recurring Charge Detection** (weekly, biweekly, monthly, quarterly, yearly)
- 📊 **Price Drift Tracking** with percent change and annualized rates
- 🏪 **Merchant Normalization** to group similar merchant names
- 📈 **Dashboard** showing top price increases
- 📋 **Merchant Detail Pages** with price history and transaction log

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Banking:** Plaid
- **Styling:** Tailwind CSS + shadcn/ui
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account (free tier works)
- Plaid account (sandbox for development)

### 1. Clone and Install

```bash
cd chargedrift
npm install
```

### 2. Environment Variables

Create a `.env.local` file:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Plaid
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
NEXT_PUBLIC_PLAID_ENV=sandbox

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup

Run the SQL migration in your Supabase SQL Editor:

```bash
# Copy contents of supabase/migrations/001_initial_schema.sql
# Paste into Supabase SQL Editor and run
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `users` | Extends Supabase auth with app-specific data |
| `accounts` | Plaid-connected bank accounts |
| `transactions` | All transactions from Plaid |
| `merchants` | Normalized merchant names |
| `merchant_aliases` | Maps raw merchant names to normalized merchants |
| `recurring_charges` | Detected recurring charges |
| `price_changes` | Individual price change events |

### Views

- `price_drift_summary` - Aggregated view for dashboard with percent change and annualized rates

## How It Works

### 1. Merchant Normalization

Raw merchant names from transactions are normalized to group similar names:
- `NETFLIX.COM` → `Netflix`
- `SPOTIFY USA` → `Spotify`
- `SQ *COFFEE SHOP #123` → `Coffee Shop`

### 2. Recurring Detection

The system analyzes transaction patterns to detect recurring charges:
- Groups transactions by merchant
- Calculates intervals between charges
- Matches against known frequencies (weekly, monthly, etc.)
- Checks amount consistency (±15% tolerance)
- Requires minimum 2 transactions with ≥50% confidence

### 3. Price Drift Calculation

For each recurring charge:
- **Percent Change:** `((current - first) / first) × 100`
- **Annualized Rate:** `((current/first)^(12/months) - 1) × 100`

## Project Structure

```
chargedrift/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── dashboard/        # Dashboard data API
│   │   │   ├── merchants/[id]/   # Merchant detail API
│   │   │   ├── plaid/            # Plaid integration APIs
│   │   │   └── recurring/        # Recurring detection API
│   │   ├── auth/                 # Auth page
│   │   ├── dashboard/            # Dashboard page
│   │   ├── merchant/[id]/        # Merchant detail page
│   │   ├── layout.tsx
│   │   └── page.tsx              # Landing page
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── plaid-link.tsx
│   │   ├── price-drift-table.tsx
│   │   └── sync-button.tsx
│   ├── lib/
│   │   ├── plaid/                # Plaid client
│   │   ├── services/             # Business logic
│   │   │   ├── merchant-normalizer.ts
│   │   │   ├── recurring-detector.ts
│   │   │   └── price-drift.ts
│   │   ├── supabase/             # Supabase clients
│   │   └── utils.ts
│   └── types/
│       └── index.ts
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/plaid/create-link-token` | POST | Create Plaid Link token |
| `/api/plaid/exchange-token` | POST | Exchange public token for access token |
| `/api/plaid/sync-transactions` | POST | Sync transactions from Plaid |
| `/api/csv/upload` | POST | Upload and process CSV file |
| `/api/recurring/detect` | POST | Run recurring charge detection |
| `/api/dashboard` | GET | Get dashboard data |
| `/api/merchants/[id]` | GET | Get merchant price history |

## CSV Import

As an alternative to Plaid, you can upload CSV files exported from your bank. The parser supports:

- Common date formats (MM/DD/YYYY, YYYY-MM-DD, etc.)
- Various column names (Date, Description, Amount, Debit, Credit)
- Automatic column detection
- Quoted fields and escaped characters

**Sample CSV format:**
```csv
Date,Description,Amount
01/15/2024,Netflix,15.99
02/15/2024,Netflix,17.99
```

You can download a sample CSV from the upload dialog to see the expected format.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page |
| `/auth` | Login/Signup |
| `/dashboard` | Main dashboard with price drift table |
| `/merchant/[id]` | Merchant detail with price history |

## Constraints

This app is intentionally focused. It does NOT include:
- ❌ Budgeting
- ❌ Categorization
- ❌ Net worth tracking
- ❌ Financial advice
- ❌ Spending analytics

## License

MIT
