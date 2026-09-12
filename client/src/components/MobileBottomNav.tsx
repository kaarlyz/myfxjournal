import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, BarChart3, BookOpen, Layers, Menu, X, PlayCircle } from 'lucide-react';

interface MobileBottomNavProps {
  onToggleMenu: () => void;
  isMenuOpen: boolean;
}

export function MobileBottomNav({ onToggleMenu, isMenuOpen }: MobileBottomNavProps) {
  const location = useLocation();

  const isHomeActive = location.pathname === '/' || location.pathname === '/sessions';
  const isDashboardActive = location.pathname.startsWith('/dashboard');
  const isReplayActive = location.pathname.startsWith('/backtest');
  const isLiveActive = location.pathname.startsWith('/live-journal');
  const isToolsActive = ['/market-data', '/prop-sim', '/monte-carlo', '/risk-calculator', '/ea-control', '/mt5-connections'].some(p => location.pathname.startsWith(p));

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t-2 border-[#121212] shadow-[0px_-2px_10px_rgba(0,0,0,0.08)] flex items-stretch justify-around h-16 safe-area-pb"
      aria-label="Navigasi Bawah Mobile"
    >
      {/* Sesi */}
      <NavLink
        to="/sessions"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors min-h-[44px] ${
          isHomeActive
            ? 'text-[#121212] bg-[#F0F0F0] font-black border-t-2 border-t-[#D02020] -mt-[2px]'
            : 'text-[#717182] hover:text-[#121212]'
        }`}
      >
        <Home className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-[Outfit]">Sesi</span>
      </NavLink>

      {/* Analisa */}
      <NavLink
        to="/dashboard"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors min-h-[44px] ${
          isDashboardActive
            ? 'text-[#121212] bg-[#F0F0F0] font-black border-t-2 border-t-[#D02020] -mt-[2px]'
            : 'text-[#717182] hover:text-[#121212]'
        }`}
      >
        <BarChart3 className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-[Outfit]">Analisa</span>
      </NavLink>

      {/* Chart Replay */}
      <NavLink
        to="/backtest"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors min-h-[44px] ${
          isReplayActive
            ? 'text-[#1040C0] bg-[#EBF2FF] font-black border-t-2 border-t-[#1040C0] -mt-[2px]'
            : 'text-[#717182] hover:text-[#121212]'
        }`}
      >
        <PlayCircle className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-[Outfit]">Replay</span>
      </NavLink>

      {/* Live */}
      <NavLink
        to="/live-journal"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors min-h-[44px] ${
          isLiveActive
            ? 'text-[#121212] bg-[#F0F0F0] font-black border-t-2 border-t-[#1040C0] -mt-[2px]'
            : 'text-[#717182] hover:text-[#121212]'
        }`}
      >
        <BookOpen className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-[Outfit]">Live</span>
      </NavLink>

      {/* Alat */}
      <NavLink
        to="/ea-control"
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors min-h-[44px] ${
          isToolsActive
            ? 'text-[#121212] bg-[#F0F0F0] font-black border-t-2 border-t-[#F0C020] -mt-[2px]'
            : 'text-[#717182] hover:text-[#121212]'
        }`}
      >
        <Layers className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-wider font-[Outfit]">Alat</span>
      </NavLink>

      {/* Menu / Drawer Toggle */}
      <button
        type="button"
        onClick={onToggleMenu}
        className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors min-h-[44px] ${
          isMenuOpen
            ? 'text-[#121212] bg-[#121212] border-t-2 border-t-[#D02020] -mt-[2px]'
            : 'text-[#717182] hover:text-[#121212]'
        }`}
        aria-label={isMenuOpen ? 'Tutup Menu' : 'Buka Menu Lengkap'}
        aria-expanded={isMenuOpen}
      >
        {isMenuOpen
          ? <X className="w-4 h-4 text-white" />
          : <Menu className="w-4 h-4" />
        }
        <span className={`text-[10px] font-bold uppercase tracking-wider font-[Outfit] ${isMenuOpen ? 'text-white' : ''}`}>
          {isMenuOpen ? 'Tutup' : 'Menu'}
        </span>
      </button>
    </nav>
  );
}

