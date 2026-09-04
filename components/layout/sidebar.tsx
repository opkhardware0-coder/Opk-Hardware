'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Boxes,
  Receipt,
  Users,
  Tags,
  Settings,
  LogOut,
  HardHat,
  Menu,
  X
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useState } from 'react';

interface SidebarProps {
  userRole: 'manager' | 'staff';
}

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const managerNav = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'POS', href: '/pos', icon: ShoppingCart },
    { name: 'Products', href: '/products', icon: Package },
    { name: 'Inventory', href: '/inventory', icon: Boxes },
    { name: 'Sales', href: '/sales', icon: Receipt },
    { name: 'Staff', href: '/staff', icon: Users },
    { name: 'Categories', href: '/categories', icon: Tags },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const staffNav = [
    { name: 'POS', href: '/pos', icon: ShoppingCart },
    { name: 'Transactions', href: '/transactions', icon: Receipt },
    { name: 'Profile', href: '/profile', icon: Users },
  ];

  const navItems = userRole === 'manager' ? managerNav : staffNav;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      <div className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform 
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:translate-x-0 transition-transform duration-200 ease-in-out
        flex flex-col
      `}>
        <div className="flex items-center h-16 px-4 border-b border-gray-200">
          <HardHat className="h-8 w-8 text-primary-600" />
          <span className="ml-2 text-xl font-bold text-gray-900">OPK HARDWARE</span>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileOpen(false)}
                className={`
                  flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors
                  ${isActive 
                    ? 'bg-primary-50 text-primary-700' 
                    : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <Icon className="h-5 w-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <LogOut className="h-5 w-5 mr-3" />
            Logout
          </button>
        </div>
      </div>

      {isMobileOpen && (
        <div className="fixed inset-0 z-30 bg-black bg-opacity-50 lg:hidden" onClick={() => setIsMobileOpen(false)} />
      )}
    </>
  );
}