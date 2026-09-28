import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import {
  Building2,
  Users,
  ShieldCheck,
  MapPin,
  Layers,
  FileText,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { userCtx } = useAuth();
  const [stats, setStats] = useState({
    outletsCount: 0,
    usersCount: 0,
    scopesCount: 0,
    statesCount: 0,
    auditLogsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);

      const [outletsRes, usersRes, scopesRes, statesRes, auditRes] = await Promise.all([
        apiFetch<any[]>('/api/v1/outlets'),
        apiFetch<any[]>('/api/v1/users'),
        apiFetch<any[]>('/api/v1/scopes'),
        apiFetch<any[]>('/api/v1/hierarchy/states'),
        apiFetch<any[]>('/api/v1/audit-logs'),
      ]);

      setStats({
        outletsCount: outletsRes.data?.length || 0,
        usersCount: usersRes.data?.length || 0,
        scopesCount: scopesRes.data?.length || 0,
        statesCount: statesRes.data?.length || 0,
        auditLogsCount: auditRes.data?.length || 0,
      });

      setLoading(false);
    };

    loadStats();
  }, [userCtx]);

  if (!userCtx) return null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-orange-400 uppercase tracking-wider mb-1">
              <Activity className="w-4 h-4" />
              <span>Phase 1A Infrastructure Operational</span>
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              Welcome, {userCtx.user.name}
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Role: <span className="text-slate-200 font-semibold">{userCtx.roles.join(', ')}</span> • Employee Code: <span className="font-mono text-slate-300">{userCtx.user.empCode}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-2.5 shrink-0">
            <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Active Scope Boundary</div>
              <div className="text-sm font-bold text-white font-mono">{userCtx.primaryScope}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Accessible Outlets</span>
            <Building2 className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {loading ? '...' : stats.outletsCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Filtered by {userCtx.primaryScope} Scope
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Scoped Users</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {loading ? '...' : stats.usersCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Accessible User Directory
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Granular Permissions</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {userCtx.isGlobalAdmin ? 'ALL (*)' : userCtx.permissions.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            Assigned to Active Role
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Audit Records</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono">
            {loading ? '...' : stats.auditLogsCount}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-mono">
            System Mutation Trail
          </p>
        </div>
      </div>

      {/* Scope Details & Security Architecture Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Active Scope Assignments */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              User Organizational Scope Assignments
            </h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
              {userCtx.scopes.length} Active Rules
            </span>
          </div>

          <div className="space-y-3">
            {userCtx.scopes.map((s, idx) => (
              <div key={s.id || idx} className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-orange-400 font-mono">LEVEL: {s.scopeLevel}</span>
                  <span className="text-[10px] text-slate-400 font-mono">Assigned by {s.createdBy}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] font-mono text-slate-300 border-t border-slate-700/40">
                  {s.stateName && <div>State: <span className="text-white font-semibold">{s.stateName}</span></div>}
                  {s.divisionName && <div>Division: <span className="text-white font-semibold">{s.divisionName}</span></div>}
                  {s.salesAreaName && <div>Sales Area: <span className="text-white font-semibold">{s.salesAreaName}</span></div>}
                  {s.outletName && <div>Outlet: <span className="text-white font-semibold">{s.outletName}</span></div>}
                  {s.scopeLevel === 'GLOBAL' && <div className="col-span-2 text-purple-300">Unrestricted access across all All-India IOCL facilities</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security & System Status */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
            Security Enforcement Matrix
          </h2>

          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">HttpOnly Cookie Auth</div>
                <p className="text-[11px] text-slate-400">Tokens stored server-side with SHA-256 hash. localStorage is not used.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Backend Scope Middleware</div>
                <p className="text-[11px] text-slate-400">Scoped database repositories enforce row-level access control on every SQL query.</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Audit Trail Logging</div>
                <p className="text-[11px] text-slate-400">All data mutations recorded with IP address, timestamp, and entity diffs.</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
