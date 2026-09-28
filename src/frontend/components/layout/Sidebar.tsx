import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS, PermissionCode } from '../../../shared/constants';
import {
  LayoutDashboard,
  Building2,
  Building,
  Users,
  ShieldAlert,
  FileCheck2,
  FolderGit2,
  Layers,
  MapPin,
  X,
  Fuel,
  Gauge,
  Clock,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  mobileOpen,
  onCloseMobile,
}) => {
  const { hasPermission, userCtx } = useAuth();

  const navItems = [
    {
      id: 'dashboard',
      label: 'Executive Dashboard',
      icon: LayoutDashboard,
      perm: null,
    },
    {
      id: 'outlets',
      label: 'Retail Outlets',
      icon: Building2,
      perm: PERMISSIONS.OUTLETS_READ,
    },
    {
      id: 'products',
      label: 'Product Catalog',
      icon: Fuel,
      perm: PERMISSIONS.PRODUCTS_READ,
    },
    {
      id: 'pump-infra',
      label: 'Pump Infrastructure',
      icon: Gauge,
      perm: PERMISSIONS.TANKS_READ,
    },
    {
      id: 'shift-ops',
      label: 'Shift Operations',
      icon: Clock,
      perm: PERMISSIONS.SHIFTS_READ,
    },
    {
      id: 'users',
      label: 'User Directory',
      icon: Users,
      perm: PERMISSIONS.USERS_READ,
    },
    {
      id: 'scopes',
      label: 'Scope Assignments',
      icon: MapPin,
      perm: PERMISSIONS.SCOPES_READ,
    },
    {
      id: 'hierarchy',
      label: 'Org Hierarchy',
      icon: Layers,
      perm: PERMISSIONS.HIERARCHY_READ,
    },
    {
      id: 'rbac',
      label: 'Roles & Permissions',
      icon: ShieldAlert,
      perm: null,
    },
    {
      id: 'audit',
      label: 'Audit Trail',
      icon: FileCheck2,
      perm: PERMISSIONS.AUDIT_READ,
    },
    {
      id: 'documents',
      label: 'Document Vault (R2)',
      icon: FolderGit2,
      perm: PERMISSIONS.DOCUMENTS_READ,
    },
  ];

  const filteredNav = navItems.filter(item => item.perm === null || hasPermission(item.perm as PermissionCode));

  const content = (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-300 w-64 p-4">
      {/* Mobile Close Button */}
      <div className="flex items-center justify-between lg:hidden mb-4 pb-2 border-b border-slate-800">
        <span className="font-bold text-white text-sm">Navigation</span>
        <button
          onClick={onCloseMobile}
          className="p-1 text-slate-400 hover:text-white rounded-md"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Scope Context Card */}
      {userCtx && (
        <div className="mb-6 p-3 rounded-xl bg-slate-800/80 border border-slate-700/60">
          <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase font-mono">
            Active User Context
          </div>
          <div className="text-sm font-bold text-white mt-0.5 truncate">
            {userCtx.user.name}
          </div>
          <div className="text-[11px] text-orange-400 font-mono mt-0.5 truncate">
            Emp Code: {userCtx.user.empCode}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-mono">Scope:</span>
            <span className="font-bold text-slate-200 font-mono px-1.5 py-0.5 rounded bg-slate-700/80">
              {userCtx.primaryScope}
            </span>
          </div>
        </div>
      )}

      {/* Nav Menu */}
      <nav className="flex-1 space-y-1">
        {filteredNav.map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/15'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="pt-4 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
        <div>IOCL Digital Pump Manager v1.0</div>
        <div>Cloudflare Worker + D1 Engine</div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block h-[calc(100vh-57px)] sticky top-[57px]">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onCloseMobile} />
          <div className="relative z-10 w-64 h-full">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
