import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { ShieldCheck, Lock, Check } from 'lucide-react';

export const RbacPage: React.FC = () => {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRbac = async () => {
      setLoading(true);
      const [rolesRes, permsRes] = await Promise.all([
        apiFetch<any[]>('/api/v1/roles'),
        apiFetch<any[]>('/api/v1/roles/permissions'),
      ]);

      if (rolesRes.data) setRoles(rolesRes.data);
      if (permsRes.data) setPermissions(permsRes.data);

      setLoading(false);
    };

    fetchRbac();
  }, []);

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-purple-400" />
          <h1 className="text-xl font-extrabold text-white">RBAC Matrix & Granular Permissions</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Role defines WHAT actions a user can execute. Scope defines WHERE they can execute it.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading system RBAC configuration...
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80">
                <tr>
                  <th className="p-4">Permission Code</th>
                  <th className="p-4">Description</th>
                  {roles.map(r => (
                    <th key={r.id} className="p-4 text-center font-bold text-white">
                      {r.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {permissions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-mono font-bold text-orange-400">
                      {p.code}
                    </td>
                    <td className="p-4 text-slate-300">
                      {p.description}
                    </td>
                    {roles.map(r => {
                      const hasPerm = r.code === 'ADMIN' || r.permissions?.some((pItem: any) => pItem.code === p.code);
                      return (
                        <td key={r.id} className="p-4 text-center">
                          {hasPerm ? (
                            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-slate-600 flex items-center justify-center mx-auto">
                              -
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
