# OPK HARDWARE - POS & Management System

Full-stack hardware shop Point of Sale and inventory management system built with Next.js, Supabase, and TypeScript.

## Architecture

- **Frontend**: Next.js 14 + React + TypeScript + Tailwind CSS
- **Backend**: Next.js API routes & server actions
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage for product images
- **Deployment**: Vercel

## Features

- Role-based access (Manager / Staff)
- Product management (CRUD + deactivation)
- Inventory tracking with stock movements
- POS with cart, checkout, and receipt
- Sales history with filters
- Staff management (create, disable)
- Dashboard with key metrics

## Setup

1. Clone repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and fill in Supabase credentials
4. Run Supabase migrations (in order: 001, 002)
5. Create a storage bucket `product-images` in Supabase
6. Create a manager account manually (see instructions below)
7. Start dev server: `npm run dev`

## Creating a Manager Account

1. Sign up a user via Supabase Auth (e.g., using the Auth UI)
2. Insert a profile record:
   ```sql
   INSERT INTO profiles (auth_user_id, staff_id, full_name, email, role, status)
   VALUES ('user-uuid', 'MGR001', 'Manager Name', 'manager@example.com', 'manager', 'active');