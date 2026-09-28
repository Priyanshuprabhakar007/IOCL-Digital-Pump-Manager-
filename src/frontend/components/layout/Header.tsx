import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Shield, User, LogOut, ChevronDown, Building2, MapPin, Menu, RefreshCw } from 'lucide-react';

interface HeaderProps {
  onToggleMobileSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar }) => {
  const { userCtx, logout, switchDemoUser } = useAuth();
  const [demoDropdownOpen, setDemoDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!userCtx) return null;

  const demoAccounts = [
    { label: 'Admin (GLOBAL)', email: 'admin@iocl.in', badge: 'ADMIN' },
    { label: 'State Office (STATE)', email: 'wbso@iocl.in', badge: 'STATE_OFFICE' },
    { label: 'Divisional Office (DIVISION)', email: 'kolkatado@iocl.in', badge: 'DIVISIONAL_OFFICE' },
    { label: 'Field Officer (SALES_AREA)', email: 'fo.central@iocl.in', badge: 'FIELD_OFFICER' },
    { label: 'Dealer (OUTLET)', email: 'dealer.parkstreet@iocl.in', badge: 'DEALER' },
    { label: 'CSP (OUTLET)', email: 'csp.parkstreet@iocl.in', badge: 'CSP' },
  ];

  const handleSwitch = async (email: string) => {
    setSwitching(true);
    setDemoDropdownOpen(false);
    await switchDemoUser(email);
    setSwitching(false);
  };

  const getScopeBadgeColor = (scope: string) => {
    switch (scope) {
      case 'GLOBAL': return 'bg-purple-900/60 text-purple-200 border-purple-500/40';
      case 'STATE': return 'bg-blue-900/60 text-blue-200 border-blue-500/40';
      case 'DIVISION': return 'bg-cyan-900/60 text-cyan-200 border-cyan-500/40';
      case 'SALES_AREA': return 'bg-emerald-900/60 text-emerald-200 border-emerald-500/40';
      case 'OUTLET': return 'bg-amber-900/60 text-amber-200 border-amber-500/40';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left branding */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileSidebar}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 lg:hidden"
            aria-label="Toggle Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-orange-500/20">
              IOC
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-bold text-white tracking-wide text-sm sm:text-base">
                IOCL <span className="text-orange-500">Digital Pump Manager</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono hidden sm:block">
                Indian Oil Corporation Limited • Retail Operations
              </div>
            </div>
          </div>
        </div>

        {/* Center / Right Scope & User info */}
        <div className="flex items-center gap-3">
          {/* Active Scope Badge */}
          <div className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-medium border ${getScopeBadgeColor(userCtx.primaryScope)}`}>
            <MapPin className="w-3.5 h-3.5 opacity-70" />
            <span>SCOPE: {userCtx.primaryScope}</span>
          </div>

          {/* Demo User Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDemoDropdownOpen(!demoDropdownOpen)}
              disabled={switching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
              title="Quickly test different roles & scope boundaries"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-orange-400 ${switching ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Role Switcher</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {demoDropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-lg bg-slate-800 border border-slate-700 shadow-xl py-1.5 z-50 text-xs">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700/60 mb-1">
                  Test Role & Scope Switching
                </div>
                {demoAccounts.map(acc => (
                  <button
                    key={acc.email}
                    onClick={() => handleSwitch(acc.email)}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-700/70 flex items-center justify-between transition-colors ${userCtx.user.email === acc.email ? 'bg-orange-500/10 text-orange-400 font-semibold' : 'text-slate-200'}`}
                  >
                    <div>
                      <div className="font-medium">{acc.label}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{acc.email}</div>
                    </div>
                    {userCtx.user.email === acc.email && (
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Active User Badge & Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-white">{userCtx.user.name}</div>
              <div className="text-[10px] text-orange-400 font-mono">
                {userCtx.roles.join(', ')}
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-medium text-xs">
              {userCtx.user.name.charAt(0)}
            </div>

            <button
              onClick={logout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
