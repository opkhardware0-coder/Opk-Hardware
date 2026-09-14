# OPK Hardware POS

**Build Better • Stronger • Together**

## 14 Files. One App. Done.

### 1. Install
```bash
npm install
```

### 2. Supabase
- https://supabase.com → New Project
- SQL Editor → paste `supabase/schema.sql` → Run
- Copy URL + anon key + service_role key from Settings → API

### 3. Env
```bash
cp .env.example .env.local
```
Fill in the three values.

### 4. Create First Manager
Supabase → **Authentication → Users → Add User**:
- Email `manager@opk.com`, Password `opk12345`, ✅ Auto-confirm

SQL Editor:
```sql
insert into profiles (auth_user_id, full_name, staff_id, email, role, status)
values (
  (select id from auth.users where email='manager@opk.com'),
  'Store Manager','MGR-001','manager@opk.com','manager','active'
);
```

### 5. Run
```bash
npm run dev
```
→ http://localhost:3000 — sign in with `manager@opk.com` / `opk12345`

### 6. Deploy to GitHub and Vercel
1. Create a GitHub repository and push this project. `.env.local`, `node_modules`, and `.next` are ignored automatically.
2. In Vercel, import the GitHub repository.
3. Open **Project Settings → Environment Variables** and add these three variables for **Production**, **Preview**, and **Development**:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
4. Redeploy after saving the variables.

Use the values from Supabase **Project Settings → API**. Never commit `.env.local` or expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code.

---

## What's Inside

**Project files:**

```
package.json              deps
tailwind.config.ts        colors/fonts
postcss.config.js         css pipeline
tsconfig.json             typescript
.env.example              supabase keys

app/
  globals.css             base styles
  layout.tsx              root html
  login/page.tsx          login screen
  app/page.tsx            the whole app

components/
  App.tsx                 UI + Sidebar + all views + all modals

lib/
  env.ts                  environment variable validation
  supabase-client.ts      browser client and shared types
  supabase-server.ts      server client and auth helpers
  supabase-admin.ts       admin client
  action.ts               server actions (sale, staff, product, stock)

supabase/
  schema.sql              tables + RLS + seed data

README.md                 this file
```

## Routes
- `/login` — Sign in
- `/app` — Everything else (Dashboard, POS, Products, Inventory, Sales, Staff, Settings)

Navigation is **client-side** (no URL changes) — fast and simple.

## Roles
- **Manager** — sees all sections
- **Staff** — sees POS + Sales + Settings only

Manager creates staff from the **Staff** section.

## Tech
Next.js 14 · React · TypeScript · Tailwind · Supabase · Vercel