import { MainLayout } from '@/components/layout/MainLayout';
import { createServerSupabaseAdmin } from '@/lib/supabase/server';
import { 
  TrendingUp, 
  ShoppingBag, 
  Package, 
  AlertTriangle,
  Users,
  DollarSign
} from 'lucide-react';

async function getDashboardStats() {
  const supabase = await createServerSupabaseAdmin();

  // Today's sales
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data: todaySales } = await supabase
    .from('sales')
    .select('total')
    .gte('created_at', today.toISOString());

  const totalSalesToday = todaySales?.reduce((sum, sale) => sum + sale.total, 0) || 0;
  const totalTransactions = todaySales?.length || 0;

  // Total products
  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('active', true);

  // Low stock
  const { count: lowStock } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)
    .lt('stock_quantity', 'low_stock_threshold');

  // Staff count
  const { count: staffCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');

  // Stock value
  const { data: stockData } = await supabase
    .from('products')
    .select('cost_price, stock_quantity')
    .eq('active', true);

  const stockValue = stockData?.reduce(
    (sum, product) => sum + (product.cost_price * product.stock_quantity), 
    0
  ) || 0;

  return {
    totalSalesToday,
    totalTransactions,
    totalProducts: totalProducts || 0,
    lowStock: lowStock || 0,
    staffCount: staffCount || 0,
    stockValue,
  };
}

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  const cards = [
    {
      title: "Today's Sales",
      value: `GH₵ ${stats.totalSalesToday.toFixed(2)}`,
      icon: TrendingUp,
      color: 'bg-green-500',
    },
    {
      title: "Today's Transactions",
      value: stats.totalTransactions,
      icon: ShoppingBag,
      color: 'bg-blue-500',
    },
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'bg-purple-500',
    },
    {
      title: 'Low Stock Items',
      value: stats.lowStock,
      icon: AlertTriangle,
      color: 'bg-red-500',
    },
    {
      title: 'Staff',
      value: stats.staffCount,
      icon: Users,
      color: 'bg-indigo-500',
    },
    {
      title: 'Stock Value',
      value: `GH₵ ${stats.stockValue.toFixed(2)}`,
      icon: DollarSign,
      color: 'bg-yellow-500',
    },
  ];

  return (
    <MainLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="bg-white rounded-lg shadow p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{card.title}</p>
                    <p className="mt-2 text-3xl font-semibold text-gray-900">
                      {card.value}
                    </p>
                  </div>
                  <div className={`${card.color} rounded-full p-3`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </MainLayout>
  );
}