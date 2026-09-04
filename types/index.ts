export type UserRole = 'manager' | 'staff';

export interface Profile {
  id: string;
  auth_user_id: string;
  staff_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  sku: string;
  description?: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_threshold: number;
  image_path?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category;
}

export interface Sale {
  id: string;
  receipt_number: string;
  staff_id: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  amount_paid: number;
  change_amount: number;
  created_at: string;
  staff?: Profile;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface StockMovement {
  id: string;
  product_id: string;
  user_id: string;
  movement_type: 'sale' | 'restock' | 'adjustment' | 'damaged' | 'returned';
  quantity: number;
  previous_quantity: number;
  new_quantity: number;
  reason?: string;
  created_at: string;
}

export interface CartItem {
  product_id: string;
  name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  stock_quantity: number;
  image_path?: string;
}