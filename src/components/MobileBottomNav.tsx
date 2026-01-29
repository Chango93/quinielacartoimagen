import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Home, Trophy, BarChart3, Settings, User } from 'lucide-react';

export default function MobileBottomNav() {
  const { user, isAdmin } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const navItems = [
    { href: '/', label: 'Inicio', icon: Home },
    { href: '/quiniela', label: 'Quiniela', icon: Trophy },
    { href: '/tabla', label: 'Tabla', icon: BarChart3 },
  ];

  if (isAdmin) {
    navItems.push({ href: '/admin', label: 'Admin', icon: Settings });
  }

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-lg border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className={`relative ${isActive ? 'scale-110' : ''} transition-transform duration-200`}>
                <Icon className="w-5 h-5" />
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
              </div>
              <span className={`text-xs mt-1 font-medium ${isActive ? 'text-primary' : ''}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
        {/* User icon that opens the dropdown in header */}
        <div className="flex flex-col items-center justify-center flex-1 h-full">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
            <User className="w-4 h-4 text-primary" />
          </div>
        </div>
      </div>
    </nav>
  );
}
