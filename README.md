# Idhayam Printers

Job & billing management web app for **Idhayam Printers**, Police Station Stop, Kalaiyarkovil - 626745.

Stack: **React + Vite + Tailwind + Framer Motion + Recharts + Supabase + PWA**.

---

## 1. One-time Setup

### a. Install Node 18+ and dependencies
```bash
cd D:\Idhayam
npm install
```

### b. Create a Supabase project
1. Go to https://supabase.com and create a new project.
2. Once it's ready, open **Project Settings -> API** and copy:
   - `Project URL`
   - `anon public` key

### c. Add credentials
Copy `.env.example` to `.env` and paste the values:
```
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### d. Create the database
1. In Supabase, open **SQL Editor -> New query**.
2. Paste the entire contents of `setup.sql` and **Run**.
3. This creates all tables, triggers, indexes, and row-level security policies.

### e. Create the shared login user
1. In Supabase, open **Authentication -> Users -> Add user**.
2. Use one shared email + password (all 3 shop users will use this).
3. Tick **Auto Confirm User**.

### f. Run the app
```bash
npm run dev
```
Open http://localhost:5173

---

## 2. Build for production / Deploy
```bash
npm run build
```
Deploy the `dist/` folder. Recommended: **Vercel**.
1. Push the repo to GitHub.
2. On Vercel: **New Project -> Import**.
3. Add the same two env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. Deploy.

The app is a **PWA** — once deployed, users can install it as a desktop / phone app.

---

## 3. Features at a glance

- Single shared login (Supabase Auth), session is remembered.
- Auto-generated Job IDs: `IPO-2026-001`, `IPO-2026-002`, ...
- 3-step new job form with progress bar, auto-save draft.
- Smart job-type dropdown — custom types added 3+ times become permanent.
- Flex jobs ask for width / height + unit (ft / inches).
- Invoice page with PDF download + print.
- Existing Jobs: search, filter, slide-in detail panel, duplicate job.
- Customer history with totals.
- Credit management with one-click payment collection.
- Expense tracking with custom categories.
- Daily cash summary (auto-saved to `daily_summary`).
- Reports with charts: monthly bar, profit trend, top customers, popular job types, expense breakdown.
- Indian formatting: ₹1,00,000 (lakhs), DD/MM/YYYY, IST timestamps.
- Keyboard shortcuts: **N** = new job, **E** = existing jobs.
- PWA installable.

---

## 4. Project structure
```
D:\Idhayam\
  setup.sql               -- Supabase DB schema, triggers, RLS
  .env.example            -- env template
  index.html
  vite.config.js
  tailwind.config.js
  postcss.config.js
  src\
    main.jsx
    App.jsx
    index.css
    lib\
      supabase.js         -- Supabase client
      format.js           -- INR + date helpers
      jobIds.js           -- (server trigger generates IDs)
    context\
      AuthContext.jsx
    components\
      Layout.jsx
      Sidebar.jsx
      ProtectedRoute.jsx
      StatCard.jsx
      StatusBadge.jsx
      Toast.jsx
      ConfirmDialog.jsx
      JobDetailPanel.jsx
      EmptyState.jsx
      Skeleton.jsx
    pages\
      Login.jsx
      Dashboard.jsx
      NewJob.jsx
      Invoice.jsx
      ExistingJobs.jsx
      Customers.jsx
      Credit.jsx
      Expenses.jsx
      DailySummary.jsx
      Reports.jsx
```
