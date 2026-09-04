-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  staff_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager', 'staff')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create categories table
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create products table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  description TEXT,
  unit TEXT NOT NULL,
  cost_price DECIMAL(10,2) NOT NULL CHECK (cost_price >= 0),
  selling_price DECIMAL(10,2) NOT NULL CHECK (selling_price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  image_path TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create sales table
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT UNIQUE NOT NULL,
  staff_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),
  discount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total DECIMAL(10,2) NOT NULL CHECK (total >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
  amount_paid DECIMAL(10,2) NOT NULL CHECK (amount_paid >= 0),
  change_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (change_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create sale_items table
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create stock_movements table
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('sale', 'restock', 'adjustment', 'damaged', 'returned')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
  new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_status ON profiles(status);
CREATE INDEX idx_profiles_auth_user_id ON profiles(auth_user_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_stock_quantity ON products(stock_quantity);
CREATE INDEX idx_sales_staff_id ON sales(staff_id);
CREATE INDEX idx_sales_created_at ON sales(created_at);
CREATE INDEX idx_sales_receipt_number ON sales(receipt_number);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);
CREATE INDEX idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_created_at ON stock_movements(created_at);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- RLS Policies (as provided earlier)
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = auth_user_id);
CREATE POLICY "Managers can view all profiles" ON profiles FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));
CREATE POLICY "Managers can update profiles" ON profiles FOR UPDATE USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));

CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (active = true OR EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));
CREATE POLICY "Managers can manage products" ON products FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));

CREATE POLICY "Anyone can view categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Managers can manage categories" ON categories FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));

CREATE POLICY "Users can view their own sales" ON sales FOR SELECT USING (staff_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "Managers can view all sales" ON sales FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));
CREATE POLICY "Staff can create sales" ON sales FOR INSERT WITH CHECK (staff_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users can view their own sale items" ON sale_items FOR SELECT USING (sale_id IN (SELECT id FROM sales WHERE staff_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())));
CREATE POLICY "Managers can view all sale items" ON sale_items FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));
CREATE POLICY "Staff can create sale items" ON sale_items FOR INSERT WITH CHECK (sale_id IN (SELECT id FROM sales WHERE staff_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid())));

CREATE POLICY "Users can view their own stock movements" ON stock_movements FOR SELECT USING (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
CREATE POLICY "Managers can view all stock movements" ON stock_movements FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE auth_user_id = auth.uid() AND role = 'manager'));
CREATE POLICY "Users can create stock movements" ON stock_movements FOR INSERT WITH CHECK (user_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));