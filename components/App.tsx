'use client';

import { useEffect, useMemo, useState, forwardRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, Menu, X, LogOut, LayoutDashboard, ShoppingCart, Package,
  Boxes, Receipt, Users, Settings, Search, Plus, Minus, Pencil, AlertTriangle,
  TrendingUp, ShoppingBag, DollarSign, Lock, User as UserIcon, Eye, EyeOff, ArrowRight,
} from 'lucide-react';
import { createClient, type Profile, type Product, type Category, type CartItem, type Sale } from '@/lib/supabase';
import { createSale, saveProduct, adjustStock, createStaff, toggleStaffStatus } from '@/lib/actions';

// ============================================================
// UI PRIMITIVES
// ============================================================
export const money = (n: number) => `GH₵${Number(n).toFixed(2)}`;

export const Button = forwardRef<HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'ghost'; loading?: boolean }
>(function Button({ variant = 'primary', loading, className = '', children, disabled, ...props }, ref) {
  const styles = {
    primary: 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm',
    secondary: 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-800',
    ghost: 'hover:bg-gray-100 text-gray-700',
  };
  return (
    <button ref={ref} disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}>
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
});

export const Input = forwardRef<HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label?: string; icon?: React.ReactNode; rightIcon?: React.ReactNode }
>(function Input({ label, icon, rightIcon, className = '', ...props }, ref) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>}
        <input ref={ref}
          className={`w-full h-12 rounded-lg border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${icon ? 'pl-10' : 'pl-4'} ${rightIcon ? 'pr-10' : 'pr-4'} ${className}`}
          {...props} />
        {rightIcon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{rightIcon}</span>}
      </div>
    </div>
  );
});

export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-card ${className}`}>{children}</div>;
}

export function Badge({ color = 'gray', children }: { color?: 'gray'|'orange'|'green'|'red'; children: React.ReactNode }) {
  const c = { gray: 'bg-gray-100 text-gray-700', orange: 'bg-brand-50 text-brand-700',
              green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-700' }[color];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>{children}</div>;
}

const ipt = "w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-500";

// ============================================================
// LOGIN FORM
// ============================================================
export function LoginForm() {
  const router = useRouter();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const sb = createClient();

    let email = id.trim();
    if (!email.includes('@')) {
      const { data } = await sb.rpc('get_email_by_staff_id', { sid: email }).maybeSingle();
      if (!data) { setError('Staff ID not found'); setLoading(false); return; }
      email = (data as any).email;
    }

    const { error: err } = await sb.auth.signInWithPassword({ email, password: pw });
    if (err) { setError(err.message); setLoading(false); return; }

    const { data: { user } } = await sb.auth.getUser();
    const { data: prof } = await sb.from('profiles').select('role, status').eq('auth_user_id', user!.id).single();

    if (!prof || prof.status === 'disabled') {
      await sb.auth.signOut();
      setError('Account disabled. Contact your manager.');
      setLoading(false);
      return;
    }
    router.push('/app'); router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Input label="Staff ID / Email" placeholder="Enter your staff ID or email"
        icon={<UserIcon className="w-4 h-4" />} value={id} onChange={(e) => setId(e.target.value)} required />
      <Input label="Password" type={show ? 'text' : 'password'} placeholder="Enter your password"
        icon={<Lock className="w-4 h-4" />}
        rightIcon={<button type="button" onClick={() => setShow(!show)}>{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>}
        value={pw} onChange={(e) => setPw(e.target.value)} required />
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">Sign In <ArrowRight className="w-4 h-4" /></Button>
      <p className="text-xs text-gray-400 text-center">
        By signing in, you agree to OPK Hardware's Terms & Privacy Policy.
      </p>
    </form>
  );
}

// ============================================================
// SIDEBAR
// ============================================================
type View = 'dashboard' | 'pos' | 'products' | 'inventory' | 'sales' | 'staff' | 'settings';

const NAV: { key: View; label: string; icon: any; mgr?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, mgr: true },
  { key: 'pos', label: 'POS', icon: ShoppingCart },
  { key: 'products', label: 'Products', icon: Package, mgr: true },
  { key: 'inventory', label: 'Inventory', icon: Boxes, mgr: true },
  { key: 'sales', label: 'Sales', icon: Receipt },
  { key: 'staff', label: 'Staff', icon: Users, mgr: true },
  { key: 'settings', label: 'Settings', icon: Settings },
];

function Sidebar({ profile, view, setView }: { profile: Profile; view: View; setView: (v: View) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.mgr || profile.role === 'manager');

  async function logout() {
    await createClient().auth.signOut();
    router.push('/login'); router.refresh();
  }

  const content = (
    <>
      <div className="flex items-center justify-between px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 40 40" className="w-8 h-8">
            <path d="M20 2L4 11v18l16 9 16-9V11L20 2z" fill="#F97316" />
            <path d="M20 6L8 13v14l12 7 12-7V13L20 6z" fill="#fff" />
            <path d="M22 12l-8 10h5l-1 8 8-10h-5l1-8z" fill="#F97316" />
          </svg>
          <div className="font-extrabold text-sm">OPK <span className="text-brand-500">HARDWARE</span></div>
        </div>
        <button onClick={() => setOpen(false)} className="lg:hidden"><X className="w-4 h-4 text-gray-500" /></button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((n) => {
          const Icon = n.icon;
          const active = view === n.key;
          return (
            <button key={n.key} onClick={() => { setView(n.key); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-brand-50 text-brand-600' : 'text-gray-600 hover:bg-gray-50'}`}>
              <Icon className="w-4 h-4" /> {n.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
            {profile.full_name[0].toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 truncate">{profile.full_name}</p>
            <p className="text-xs text-gray-500 capitalize">{profile.role}</p>
          </div>
        </div>
        <button onClick={logout} className="mt-1 w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">
          <LogOut className="w-4 h-4" /> Logout
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-30">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2"><Menu className="w-5 h-5 text-gray-700" /></button>
        <div className="font-extrabold text-sm">OPK <span className="text-brand-500">HARDWARE</span></div>
        <div className="w-5" />
      </div>
      {open && <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 left-0 h-screen w-60 bg-white border-r border-gray-200 flex flex-col z-50 transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {content}
      </aside>
    </>
  );
}

// ============================================================
// DASHBOARD VIEW
// ============================================================
function DashboardView({ profile }: { profile: Profile }) {
  const [stats, setStats] = useState({ sales: 0, tx: 0, prods: 0, low: 0, value: 0, staff: 0 });
  const [recent, setRecent] = useState<Sale[]>([]);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [{ data: s }, { data: p }, { count: c }, { data: r }] = await Promise.all([
        sb.from('sales').select('total').gte('created_at', today.toISOString()),
        sb.from('products').select('stock_quantity, cost_price, low_stock_threshold').eq('active', true),
        sb.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('sales').select('*, staff:profiles(full_name)').order('created_at', { ascending: false }).limit(8),
      ]);
      setStats({
        sales: (s ?? []).reduce((a, x) => a + Number(x.total), 0),
        tx: s?.length ?? 0,
        prods: p?.length ?? 0,
        low: (p ?? []).filter((x) => Number(x.stock_quantity) <= Number(x.low_stock_threshold)).length,
        value: (p ?? []).reduce((a, x) => a + Number(x.stock_quantity) * Number(x.cost_price), 0),
        staff: c ?? 0,
      });
      setRecent((r as Sale[]) ?? []);
    })();
  }, []);

  const cards = [
    { label: "Today's Sales", value: money(stats.sales), icon: TrendingUp, cls: 'text-green-600 bg-green-50' },
    { label: "Today's Transactions", value: String(stats.tx), icon: ShoppingBag, cls: 'text-blue-600 bg-blue-50' },
    { label: 'Total Products', value: String(stats.prods), icon: Package, cls: 'text-purple-600 bg-purple-50' },
    { label: 'Low Stock', value: String(stats.low), icon: AlertTriangle, cls: 'text-red-600 bg-red-50' },
    { label: 'Stock Value', value: money(stats.value), icon: DollarSign, cls: 'text-brand-600 bg-brand-50' },
    { label: 'Active Staff', value: String(stats.staff), icon: Users, cls: 'text-indigo-600 bg-indigo-50' },
  ];

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Welcome back, {profile.full_name}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${c.cls}`}><Icon className="w-4 h-4" /></div>
              <p className="text-xs text-gray-500 font-medium mt-3">{c.label}</p>
              <p className="text-lg font-extrabold mt-1 truncate">{c.value}</p>
            </Card>
          );
        })}
      </div>
      <Card className="p-5">
        <h3 className="font-bold mb-4">Recent Sales</h3>
        {!recent.length ? <p className="text-sm text-gray-500 text-center py-6">No sales yet.</p> :
          recent.map((s) => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-semibold">{s.receipt_number}</p>
                <p className="text-xs text-gray-500">{s.staff?.full_name ?? '—'} • {s.payment_method}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-brand-600">{money(s.total)}</p>
                <p className="text-[11px] text-gray-400">{new Date(s.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          ))}
      </Card>
    </div>
  );
}

// ============================================================
// POS VIEW
// ============================================================
function POSView({ profile, products, categories, reload }: {
  profile: Profile; products: Product[]; categories: Category[]; reload: () => void;
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [payment, setPayment] = useState('Cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const payments = ['Cash', 'Mobile Money', 'Bank Transfer', 'Card', 'Other'];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      if (cat !== 'all' && p.category_id !== cat) return false;
      return !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
    });
  }, [products, search, cat]);

  function add(p: Product) {
    setCart((c) => c.find((i) => i.product.id === p.id)
      ? c.map((i) => i.product.id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      : [...c, { product: p, quantity: 1 }]);
  }

  const subtotal = cart.reduce((s, i) => s + i.product.selling_price * i.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const count = cart.reduce((s, i) => s + i.quantity, 0);

  async function checkout() {
    if (!cart.length) return;
    setBusy(true); setError('');
    const res = await createSale({
      items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      discount, payment_method: payment,
    });
    setBusy(false);
    if (res.error) return setError(res.error);
    setCart([]); setDiscount(0); setOpen(false); reload();
  }

  const CartView = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <h3 className="font-bold flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-brand-500" /> Cart ({cart.length})</h3>
        {cart.length > 0 && <button onClick={() => { setCart([]); setDiscount(0); }} className="text-xs text-brand-600 font-semibold">Clear</button>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!cart.length ? (
          <div className="text-center py-16 text-sm text-gray-400">
            <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-gray-300" /> Cart is empty
          </div>
        ) : cart.map((i) => (
          <div key={i.product.id} className="flex gap-3 pb-3 border-b border-gray-100 last:border-0">
            <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center text-xl">📦</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold line-clamp-1">{i.product.name}</p>
                <button onClick={() => setCart(cart.filter((x) => x.product.id !== i.product.id))} className="text-gray-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{money(i.product.selling_price)} / {i.product.unit}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <button onClick={() => setCart(cart.map((x) => x.product.id === i.product.id ? { ...x, quantity: Math.max(0, x.quantity - 1) } : x).filter((x) => x.quantity > 0))}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center"><Minus className="w-3 h-3" /></button>
                  <span className="text-sm font-semibold w-6 text-center">{i.quantity}</span>
                  <button onClick={() => setCart(cart.map((x) => x.product.id === i.product.id ? { ...x, quantity: x.quantity + 1 } : x))}
                    className="w-6 h-6 rounded border border-gray-200 flex items-center justify-center"><Plus className="w-3 h-3" /></button>
                </div>
                <span className="text-sm font-bold">{money(i.product.selling_price * i.quantity)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal</span><span className="font-semibold">{money(subtotal)}</span></div>
          {profile.role === 'manager' ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Discount</span>
              <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-24 h-8 text-right text-sm border border-gray-200 rounded px-2" />
            </div>
          ) : <div className="flex justify-between text-sm"><span className="text-gray-600">Discount</span><span className="font-semibold">{money(0)}</span></div>}
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="font-bold">Total</span>
            <span className="font-extrabold text-brand-600 text-lg">{money(total)}</span>
          </div>
          <div className="pt-2">
            <p className="text-xs font-semibold text-gray-600 mb-2">Payment Method</p>
            <div className="grid grid-cols-2 gap-2">
              {payments.map((p) => (
                <button key={p} onClick={() => setPayment(p)}
                  className={`h-9 rounded-lg text-xs font-semibold border ${payment === p ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-gray-200'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <Button onClick={checkout} loading={busy} className="w-full mt-2">Complete Sale</Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[calc(100vh-3.5rem)] lg:h-screen flex overflow-hidden">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 lg:px-6 pt-4 lg:pt-6">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products..."
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-200 bg-white text-sm" />
            </div>
            {profile.role === 'manager' && (
              <button onClick={() => setAddOpen(true)} className="h-11 px-4 rounded-lg bg-brand-500 text-white text-sm font-semibold flex items-center gap-2">
                <Plus className="w-4 h-4" /><span className="hidden sm:inline">Add</span>
              </button>
            )}
          </div>
          <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
            <button onClick={() => setCat('all')} className={`whitespace-nowrap px-3.5 h-8 rounded-full text-xs font-semibold border ${cat === 'all' ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-gray-200'}`}>All</button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setCat(c.id)}
                className={`whitespace-nowrap px-3.5 h-8 rounded-full text-xs font-semibold border ${cat === c.id ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-gray-200'}`}>{c.name}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
          {!filtered.length ? <p className="text-sm text-gray-500 text-center py-16">No products.</p> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
              {filtered.map((p) => {
                const low = Number(p.stock_quantity) <= Number(p.low_stock_threshold);
                const out = Number(p.stock_quantity) <= 0;
                return (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-2.5 flex flex-col">
                    <div className="aspect-square rounded-lg bg-gray-100 flex items-center justify-center text-3xl">📦</div>
                    <p className="text-sm font-semibold line-clamp-1 mt-2">{p.name}</p>
                    <p className="text-xs text-brand-600 font-bold mt-0.5">{money(p.selling_price)} <span className="text-gray-400">/ {p.unit}</span></p>
                    <div className="mt-auto pt-2 flex items-center justify-between">
                      <span className={`text-[11px] ${out ? 'text-red-500' : low ? 'text-yellow-600' : 'text-gray-500'}`}>Stock: {Number(p.stock_quantity)}</span>
                      <button onClick={() => add(p)} disabled={out}
                        className="w-7 h-7 rounded-full bg-brand-500 disabled:bg-gray-300 text-white flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="hidden lg:flex flex-col w-80 xl:w-96 bg-white border-l border-gray-200">{CartView}</aside>

      <button onClick={() => setOpen(true)} className="lg:hidden fixed bottom-5 right-5 z-30 bg-brand-500 text-white rounded-full h-14 px-5 flex items-center gap-2 shadow-lg font-semibold">
        <ShoppingCart className="w-5 h-5" /> Cart
        {count > 0 && <span className="bg-white text-brand-600 rounded-full w-6 h-6 text-xs flex items-center justify-center font-bold">{count}</span>}
      </button>

      {open && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
          <div className="w-full max-w-md bg-white flex flex-col">{CartView}</div>
        </div>
      )}

      <AddProductModal open={addOpen} onClose={() => setAddOpen(false)} categories={categories} onSaved={() => { setAddOpen(false); reload(); }} />
    </div>
  );
}

// ============================================================
// PRODUCTS VIEW
// ============================================================
function ProductsView({ products, categories, reload }: { products: Product[]; categories: Category[]; reload: () => void }) {
  const [edit, setEdit] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold">Products</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} products</p>
        </div>
        <Button onClick={() => { setEdit(null); setOpen(true); }}><Plus className="w-4 h-4" /> Add</Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Product</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{p.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{money(p.cost_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-brand-600">{money(p.selling_price)}</td>
                  <td className="px-4 py-3 text-right">{Number(p.stock_quantity)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEdit(p); setOpen(true); }} className="text-gray-400 hover:text-brand-600"><Pencil className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <AddProductModal open={open} onClose={() => setOpen(false)} categories={categories} product={edit} onSaved={() => { setOpen(false); reload(); }} />
    </div>
  );
}

function AddProductModal({ open, onClose, categories, product, onSaved }: {
  open: boolean; onClose: () => void; categories: Category[]; product?: Product | null; onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: '', category_id: '', sku: '', unit: 'piece', cost_price: '', selling_price: '', stock_quantity: '', low_stock_threshold: '10' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (product) setForm({
      name: product.name, category_id: product.category_id ?? '', sku: product.sku ?? '', unit: product.unit,
      cost_price: String(product.cost_price), selling_price: String(product.selling_price),
      stock_quantity: String(product.stock_quantity), low_stock_threshold: String(product.low_stock_threshold),
    });
    else setForm({ name: '', category_id: '', sku: '', unit: 'piece', cost_price: '', selling_price: '', stock_quantity: '', low_stock_threshold: '10' });
  }, [product, open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const res = await saveProduct({
      id: product?.id, ...form, category_id: form.category_id || null,
      cost_price: Number(form.cost_price), selling_price: Number(form.selling_price),
      stock_quantity: Number(form.stock_quantity), low_stock_threshold: Number(form.low_stock_threshold),
    } as any);
    setBusy(false);
    if (res.error) return setErr(res.error);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Edit Product' : 'Add Product'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={ipt} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className={ipt}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Unit"><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={ipt} /></Field>
        </div>
        <Field label="SKU"><input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className={ipt} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cost"><input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} className={ipt} /></Field>
          <Field label="Price"><input required type="number" step="0.01" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className={ipt} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock"><input required type="number" step="0.01" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} className={ipt} /></Field>
          <Field label="Low Alert"><input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className={ipt} /></Field>
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{product ? 'Save' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// INVENTORY VIEW
// ============================================================
function InventoryView({ products, reload }: { products: Product[]; reload: () => void }) {
  const [edit, setEdit] = useState<Product | null>(null);
  const low = products.filter((p) => Number(p.stock_quantity) <= Number(p.low_stock_threshold));

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Inventory</h1>
        <p className="text-sm text-gray-500 mt-1">{products.length} products • {low.length} low stock</p>
      </div>
      {low.length > 0 && (
        <Card className="p-4 mb-5 border-yellow-200 bg-yellow-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <div><p className="font-semibold text-yellow-800 text-sm">Low Stock</p><p className="text-xs text-yellow-700 mt-0.5">{low.length} product(s) need restocking.</p></div>
          </div>
        </Card>
      )}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
              <tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Alert</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map((p) => {
                const isLow = Number(p.stock_quantity) <= Number(p.low_stock_threshold);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{Number(p.stock_quantity)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{Number(p.low_stock_threshold)}</td>
                    <td className="px-4 py-3">{isLow ? <Badge color="red">Low</Badge> : <Badge color="green">OK</Badge>}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setEdit(p)} className="text-xs text-brand-600 font-semibold">Adjust</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <AdjustModal product={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
    </div>
  );
}

function AdjustModal({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('Restock');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (product) setQty(String(product.stock_quantity)); }, [product]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!product) return;
    setBusy(true); await adjustStock(product.id, Number(qty), reason);
    setBusy(false); onSaved();
  }

  if (!product) return null;

  return (
    <Modal open onClose={onClose} title={`Adjust — ${product.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-gray-500">Current: <span className="font-semibold text-gray-800">{Number(product.stock_quantity)}</span></p>
        <Field label="New Quantity"><input required type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className={ipt} /></Field>
        <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} className={ipt} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// SALES VIEW
// ============================================================
function SalesView({ profile }: { profile: Profile }) {
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    (async () => {
      const sb = createClient();
      let q = sb.from('sales').select('*, staff:profiles(full_name)').order('created_at', { ascending: false }).limit(100);
      if (profile.role === 'staff') q = q.eq('staff_id', profile.id);
      const { data } = await q;
      setSales((data as Sale[]) ?? []);
    })();
  }, [profile]);

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold">Sales</h1>
        <p className="text-sm text-gray-500 mt-1">{profile.role === 'manager' ? 'All transactions' : 'Your transactions'}</p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
              <tr><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Staff</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3">Date</th><th className="px-4 py-3 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!sales.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500 text-sm">No sales yet.</td></tr>}
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold">{s.receipt_number}</td>
                  <td className="px-4 py-3 text-gray-600">{s.staff?.full_name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{s.payment_method}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(s.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-600">{money(s.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// STAFF VIEW
// ============================================================
function StaffView({ reload }: { reload: () => void }) {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    createClient().from('profiles').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setStaff((data as Profile[]) ?? []));
  }, []);

  async function toggle(p: Profile) {
    await toggleStaffStatus(p.id, p.status === 'active' ? 'disabled' : 'active');
    const { data } = await createClient().from('profiles').select('*').order('created_at', { ascending: false });
    setStaff((data as Profile[]) ?? []);
  }

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-extrabold">Staff</h1><p className="text-sm text-gray-500 mt-1">{staff.length} team members</p></div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Create Staff</Button>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Staff ID</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {staff.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.staff_id}</td>
                  <td className="px-4 py-3 text-gray-600">{p.email}</td>
                  <td className="px-4 py-3"><Badge color={p.role === 'manager' ? 'orange' : 'gray'}>{p.role}</Badge></td>
                  <td className="px-4 py-3"><Badge color={p.status === 'active' ? 'green' : 'red'}>{p.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {p.role !== 'manager' && (
                      <button onClick={() => toggle(p)} className="text-xs text-brand-600 font-semibold">
                        {p.status === 'active' ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <CreateStaffModal open={open} onClose={() => setOpen(false)} onSaved={() => {
        setOpen(false); reload();
        createClient().from('profiles').select('*').order('created_at', { ascending: false })
          .then(({ data }) => setStaff((data as Profile[]) ?? []));
      }} />
    </div>
  );
}

function CreateStaffModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ full_name: '', staff_id: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const res = await createStaff(form);
    setBusy(false);
    if (res.error) return setErr(res.error);
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Staff">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full Name"><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={ipt} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff ID"><input required value={form.staff_id} onChange={(e) => setForm({ ...form, staff_id: e.target.value })} className={ipt} /></Field>
          <Field label="Email"><input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={ipt} /></Field>
        </div>
        <Field label="Temporary Password"><input required type="text" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={ipt} /></Field>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Create</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// SETTINGS VIEW
// ============================================================
function SettingsView({ profile }: { profile: Profile }) {
  const rows = [['Full Name', profile.full_name], ['Staff ID', profile.staff_id], ['Email', profile.email], ['Role', profile.role], ['Status', profile.status]];
  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <div className="mb-6"><h1 className="text-2xl font-extrabold">Settings</h1><p className="text-sm text-gray-500 mt-1">Manage your account</p></div>
      <Card className="p-5">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-500">{k}</span>
            <span className="text-sm font-semibold col-span-2 capitalize">{v}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ============================================================
// APP SHELL — the whole app after login
// ============================================================
export default function App({ profile }: { profile: Profile }) {
  const [view, setView] = useState<View>(profile.role === 'manager' ? 'dashboard' : 'pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  async function load() {
    const sb = createClient();
    const [{ data: p }, { data: c }] = await Promise.all([
      sb.from('products').select('*').eq('active', true).order('name'),
      sb.from('categories').select('*').order('name'),
    ]);
    setProducts((p as Product[]) ?? []);
    setCategories((c as Category[]) ?? []);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar profile={profile} view={view} setView={setView} />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        {view === 'dashboard' && profile.role === 'manager' && <DashboardView profile={profile} />}
        {view === 'pos' && <POSView profile={profile} products={products} categories={categories} reload={load} />}
        {view === 'products' && profile.role === 'manager' && <ProductsView products={products} categories={categories} reload={load} />}
        {view === 'inventory' && profile.role === 'manager' && <InventoryView products={products} reload={load} />}
        {view === 'sales' && <SalesView profile={profile} />}
        {view === 'staff' && profile.role === 'manager' && <StaffView reload={load} />}
        {view === 'settings' && <SettingsView profile={profile} />}
      </main>
    </div>
  );
}