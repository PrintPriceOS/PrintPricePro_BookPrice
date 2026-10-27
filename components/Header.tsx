import React from 'react';
import { ShoppingCartIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import UserMenu from './UserMenu';
import type { AuthUser } from './UserMenu';

const PPOSLogo = ({ className = 'h-9 w-9' }: { className?: string }) => (
  <svg
    viewBox="0 0 375 375"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ transform: 'none' }}
  >
    <g transform="translate(0 375) scale(1 -1)">
      <path d="M 85.105,36.879 L 123.906,283.831 L 208.244,283.831 L 208.244,283.796 L 223.392,284.277 C 241.132,283.77 259.109,279.984 275.228,272.196 C 298.182,261.111 315.657,242.452 320.168,218.465 C 324.772,193.98 314.629,170.543 295.664,153.354 C 281.594,140.598 263.793,132.049 245.121,127.353 L 233.92,125.013 L 220.073,36.879 L 85.105,36.879 Z" className="fill-corporate-accent" />
      <path d="M 78.73,316.22 C 105.371,346.991 151.966,350.343 182.738,323.702 C 213.509,297.061 216.861,250.466 190.22,219.694 C 163.579,188.923 116.984,185.571 86.212,212.212 C 55.441,238.853 52.089,285.448 78.73,316.22 Z" className="fill-corporate-accent" />
      <path d="M 116.151,63.426 L 146.61,257.283 L 208.244,257.283 C 227.637,257.846 247.271,256.22 263.681,248.292 C 298.68,231.384 305.019,197.664 277.836,173.026 C 261.255,157.996 236.009,149.8 210.898,149.53 L 197.37,63.426 L 116.151,63.426 Z" className="fill-corporate-secondary" />
    </g>
  </svg>
);

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
  onMyOrdersClick: () => void;
  isDark: boolean;
  onThemeToggle: () => void;
  user: AuthUser | null;
  onOpenAuthModal: () => void;
  onLogout: () => void;
  currentView?: 'marketplace' | 'printhouse';
  onViewChange?: (view: 'marketplace' | 'printhouse') => void;
}

const Header: React.FC<HeaderProps> = ({
  cartCount,
  onCartClick,
  onMyOrdersClick,
  isDark,
  onThemeToggle,
  user,
  onOpenAuthModal,
  onLogout,
  currentView = 'marketplace',
  onViewChange
}) => {
  return (
    <header className="sticky top-0 z-50 bg-corporate-secondary border-b border-white/10">
      <div className="container mx-auto px-6 md:px-10 max-w-[1400px] h-20 flex items-center justify-between">
        {/* Logo / Brand */}
        <div className="flex items-center gap-6 min-w-max">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => onViewChange?.('marketplace')}>
            <PPOSLogo className="h-9 w-9" />
            <div className="hidden md:block">
              <div className="flex items-baseline gap-1.5 leading-none uppercase">
                <span className="text-[0.65rem] font-sans font-black tracking-monolith text-corporate-accent">
                  PrintPrice
                </span>
                <span className="text-[0.65rem] font-sans font-black tracking-monolith text-corporate-text">
                  Pro
                </span>
              </div>
              <div className="text-[0.6rem] uppercase tracking-[0.55em] text-corporate-muted mt-1 ml-0.5 font-technical opacity-90">
                Book Price
              </div>
            </div>
          </div>

          {/* View Switcher (Only if logged in or for testing) */}
          {onViewChange && (
            <div className="hidden lg:flex items-center bg-black/20 p-1 border border-white/5">
              <button
                onClick={() => onViewChange('marketplace')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-monolith transition-all ${currentView === 'marketplace'
                    ? 'bg-corporate-accent text-white shadow-lg'
                    : 'text-corporate-muted hover:text-white'
                  }`}
              >
                Marketplace
              </button>
              <button
                onClick={() => onViewChange('printhouse')}
                className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-monolith transition-all ${currentView === 'printhouse'
                    ? 'bg-corporate-accent text-white shadow-lg'
                    : 'text-corporate-muted hover:text-white'
                  }`}
              >
                Console
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 min-w-max">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={onThemeToggle}
            className="group flex items-center gap-2 px-3 py-2 border border-white/10 hover:border-corporate-accent hover:bg-white/5 transition-all text-corporate-text-secondary hover:text-corporate-accent"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <SunIcon className="w-4 h-4" />
            ) : (
              <MoonIcon className="w-4 h-4" />
            )}
            <span className="hidden md:inline text-[0.6rem] font-sans font-black tracking-monolith uppercase">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          {/* My Orders (Public access enabled v5.3) */}
          {currentView === 'marketplace' && (
            <button
              type="button"
              onClick={onMyOrdersClick}
              className="flex items-center gap-2 px-3 py-2 border border-white/10 hover:border-corporate-accent hover:bg-white/5 transition-all text-corporate-text-secondary hover:text-corporate-accent"
              aria-label="My Orders"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <span className="hidden md:inline text-[0.6rem] font-sans font-black tracking-monolith uppercase">
                My Orders
              </span>
            </button>
          )}

          {/* Cart (Only in marketplace view) */}
          {currentView === 'marketplace' && (
            <button
              type="button"
              onClick={onCartClick}
              className="relative flex items-center justify-center w-9 h-9 text-corporate-text-secondary hover:text-corporate-accent transition-colors"
              aria-label="Cart"
            >
              <ShoppingCartIcon className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 bg-corporate-accent text-white text-[0.5rem] font-black leading-none">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
          )}

          <div className="h-5 w-px bg-white/10 mx-1 hidden md:block" />

          {/* User menu */}
          <UserMenu user={user} onOpenModal={onOpenAuthModal} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
};

export default Header;
