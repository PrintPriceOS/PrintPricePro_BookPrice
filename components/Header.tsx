import React from 'react';
import {
  ShoppingCartIcon,
  SunIcon,
  MoonIcon,
  ShieldCheckIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';
import UserMenu from './UserMenu';
import type { AuthUser } from './UserMenu';

const PPOSLogo = ({ className = 'h-7 w-7 sm:h-9 sm:w-9' }: { className?: string }) => (
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
    <header className="sticky top-0 z-50 bg-corporate-secondary/95 backdrop-blur-md border-b border-corporate-border transition-colors">
      {/* Top Industrial Signal Bar */}
      <div className="h-[2px] w-full bg-corporate-accent" />

      <div className="w-full mx-auto px-2.5 sm:px-6 lg:px-8 max-w-[1400px] h-14 sm:h-16 md:h-20 flex items-center justify-between gap-2">
        {/* Left: Brand + Ecosystem Telemetry Badge */}
        <div className="flex items-center gap-2 sm:gap-5 min-w-0">
          <div
            className="flex items-center gap-2 sm:gap-3.5 cursor-pointer min-w-0 group"
            onClick={() => onViewChange?.('marketplace')}
          >
            <PPOSLogo className="h-7 w-7 sm:h-9 sm:w-9 shrink-0" />
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-1 sm:gap-1.5 leading-none uppercase">
                <span className="text-[11px] sm:text-xs font-sans font-black tracking-wider sm:tracking-monolith text-corporate-accent">
                  PrintPrice
                </span>
                <span className="text-[11px] sm:text-xs font-sans font-black tracking-wider sm:tracking-monolith text-corporate-text">
                  OS
                </span>
              </div>
              <div className="text-[8px] sm:text-[9px] uppercase tracking-[0.12em] sm:tracking-[0.28em] text-corporate-muted mt-0.5 sm:mt-1 font-technical font-bold truncate">
                Book Price &amp; Materials
              </div>
            </div>
          </div>

          {/* Ecosystem Status Pill (Matches Control Plane Topbar.tsx) */}
          <div
            className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full badge-success border text-[10px] font-technical font-bold uppercase tracking-wider shrink-0"
            title="Connected to PrintPrice OS Control Plane & Book Price Engine (BPE)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span>Control Plane &amp; BPE Active</span>
          </div>

          {/* View Switcher (Only if enabled) */}
          {onViewChange && (
            <div className="hidden lg:flex items-center bg-corporate-elevated p-1 rounded-xl border border-corporate-border">
              <button
                type="button"
                onClick={() => onViewChange('marketplace')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  currentView === 'marketplace'
                    ? 'bg-corporate-accent text-white shadow-sm'
                    : 'text-corporate-muted hover:text-corporate-text'
                }`}
              >
                Configurator
              </button>
              <button
                type="button"
                onClick={() => onViewChange('printhouse')}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  currentView === 'printhouse'
                    ? 'bg-corporate-accent text-white shadow-sm'
                    : 'text-corporate-muted hover:text-corporate-text'
                }`}
              >
                Console
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions (Touch targets >= 40x40px on mobile, >= 44x44px comfortable) */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={onThemeToggle}
            className="group min-h-[40px] sm:min-h-[42px] min-w-[40px] flex items-center justify-center gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl border border-corporate-border hover:border-corporate-accent bg-corporate-elevated/60 hover:bg-corporate-elevated transition-all text-corporate-text-secondary hover:text-corporate-accent"
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? (
              <SunIcon className="w-4 h-4 shrink-0" />
            ) : (
              <MoonIcon className="w-4 h-4 shrink-0" />
            )}
            <span className="hidden md:inline text-[10px] font-technical font-bold tracking-wider uppercase">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          {/* My Orders */}
          {currentView === 'marketplace' && (
            <button
              type="button"
              onClick={onMyOrdersClick}
              className="min-h-[40px] sm:min-h-[42px] min-w-[40px] flex items-center justify-center gap-2 px-2.5 sm:px-3.5 py-2 rounded-xl border border-corporate-border hover:border-corporate-accent bg-corporate-elevated/60 hover:bg-corporate-elevated transition-all text-corporate-text-secondary hover:text-corporate-accent"
              aria-label="My Orders"
              title="My Orders"
            >
              <ClipboardDocumentListIcon className="w-4 h-4 shrink-0" />
              <span className="hidden md:inline text-[10px] font-technical font-bold tracking-wider uppercase">
                My Orders
              </span>
            </button>
          )}

          {/* Cart */}
          {currentView === 'marketplace' && (
            <button
              type="button"
              onClick={onCartClick}
              className="relative flex items-center justify-center w-10 h-10 sm:w-[42px] sm:h-[42px] rounded-xl border border-corporate-border hover:border-corporate-accent bg-corporate-elevated/60 text-corporate-text-secondary hover:text-corporate-accent transition-all"
              aria-label="Cart"
              title="Shopping Cart"
            >
              <ShoppingCartIcon className="w-4 h-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 rounded-full bg-corporate-accent text-white text-[9px] font-technical font-black leading-none">
                  {cartCount > 9 ? '9+' : cartCount}
                </span>
              )}
            </button>
          )}

          <div className="h-5 w-px bg-corporate-border mx-0.5 hidden sm:block" />

          {/* User menu */}
          <UserMenu user={user} onOpenModal={onOpenAuthModal} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
};

export default Header;
