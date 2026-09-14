import { createBrowserClient } from '@supabase/ssr';

export type Role = 'manager' | 'staff';

export interface Profile {
  id: string;
  auth_user_id: string;
  full_name: string;
  staff_id: string;
  email: string;
  role: Role;
  status: 'active' | 'disabled';
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  sku: string | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_path: string | null;
  active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Sale {
  id: string;
  receipt_number: string;
  staff_id: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  created_at: string;
  staff?: { full_name: string };
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createClient() {
  return createBrowserClient(URL, ANON);
}
