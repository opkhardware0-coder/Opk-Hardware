'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase, createAdminSupabase, getCurrentProfile } from './supabase';
import type { Product } from './supabase';

// ---------- CREATE SALE ----------
export async function createSale(input: {
  items: { product_id: string; quantity: number }[];
  discount: number;
  payment_method: string;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return { error: 'Not authenticated' };

  const db = createServerSupabase();
  const ids = input.items.map((i) => i.product_id);
  const { data: rows } = await db.from('products').select('*').in('id', ids);
  if (!rows) return { error: 'Failed to load products' };
  const map = new Map(rows.map((p) => [p.id, p as Product]));

  let subtotal = 0;
  const items = input.items.map((i) => {
    const p = map.get(i.product_id)!;
    const t = p.selling_price * i.quantity;
    subtotal += t;
    return {
      product_id: p.id, product_name_snapshot: p.name,
      quantity: i.quantity, unit_price: p.selling_price, total_price: t,
    };
  });

  const total = Math.max(0, subtotal - input.discount);
  const receipt = `OPK-${Date.now().toString().slice(-8)}`;

  const { data: sale, error } = await db.from('sales').insert({
    receipt_number: receipt, staff_id: profile.id, subtotal,
    discount: input.discount, total, payment_method: input.payment_method,
    amount_paid: total, change_amount: 0,
  }).select().single();
  if (error || !sale) return { error: error?.message ?? 'Sale failed' };

  await db.from('sale_items').insert(items.map((i) => ({ ...i, sale_id: sale.id })));

  for (const item of input.items) {
    const p = map.get(item.product_id)!;
    const newQty = Number(p.stock_quantity) - item.quantity;
    await db.from('products').update({ stock_quantity: newQty }).eq('id', p.id);
    await db.from('stock_movements').insert({
      product_id: p.id, user_id: profile.id, movement_type: 'out',
      quantity: item.quantity, previous_quantity: p.stock_quantity,
      new_quantity: newQty, reason: receipt,
    });
  }

  revalidatePath('/app');
  return { success: true, sale };
}

// ---------- PRODUCTS ----------
export async function saveProduct(input: Partial<Product> & { id?: string }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'manager') return { error: 'Unauthorized' };

  const db = createServerSupabase();
  const payload = {
    name: input.name!, category_id: input.category_id || null,
    sku: input.sku || null, unit: input.unit || 'piece',
    cost_price: Number(input.cost_price) || 0,
    selling_price: Number(input.selling_price) || 0,
    stock_quantity: Number(input.stock_quantity) || 0,
    low_stock_threshold: Number(input.low_stock_threshold) || 10,
    active: true, updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await db.from('products').update(payload).eq('id', input.id)
    : await db.from('products').insert(payload);
  if (error) return { error: error.message };
  revalidatePath('/app');
  return { success: true };
}

export async function adjustStock(productId: string, newQty: number, reason: string) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'manager') return { error: 'Unauthorized' };

  const db = createServerSupabase();
  const { data: p } = await db.from('products').select('stock_quantity').eq('id', productId).single();
  if (!p) return { error: 'Not found' };
  const prev = Number(p.stock_quantity);
  const diff = newQty - prev;

  await db.from('products').update({ stock_quantity: newQty }).eq('id', productId);
  await db.from('stock_movements').insert({
    product_id: productId, user_id: profile.id,
    movement_type: diff >= 0 ? 'in' : 'out',
    quantity: Math.abs(diff), previous_quantity: prev, new_quantity: newQty, reason,
  });
  revalidatePath('/app');
  return { success: true };
}

// ---------- STAFF ----------
export async function createStaff(input: { full_name: string; staff_id: string; email: string; password: string }) {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'manager') return { error: 'Unauthorized' };

  const admin = createAdminSupabase();
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true,
  });
  if (authErr || !authUser.user) return { error: authErr?.message ?? 'Failed' };

  const { error } = await admin.from('profiles').insert({
    auth_user_id: authUser.user.id, full_name: input.full_name,
    staff_id: input.staff_id, email: input.email, role: 'staff', status: 'active',
  });
  if (error) { await admin.auth.admin.deleteUser(authUser.user.id); return { error: error.message }; }
  revalidatePath('/app');
  return { success: true };
}

export async function toggleStaffStatus(id: string, status: 'active' | 'disabled') {
  const profile = await getCurrentProfile();
  if (profile?.role !== 'manager') return { error: 'Unauthorized' };
  const { error } = await createServerSupabase().from('profiles').update({ status }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/app');
  return { success: true };
}