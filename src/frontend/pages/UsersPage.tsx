import { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { User, RoleCode } from '../../shared/types';
import { PERMISSIONS, ROLES } from '../../shared/constants';
import { Users, UserPlus, Shield, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export const UsersPage = () => {
  const { hasPermission, userCtx } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    empCode: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    roleCodes: [ROLES.FIELD_OFFICER] as RoleCode[],
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  });

  const fetchUsers = async () => {
    setLoading(true);
    const res = await apiFetch<any[]>('/api/v1/users');
    if (res.success && res.data) {
      setUsers(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const res = await apiFetch('/api/v1/users', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    if (res.success) {
      setModalOpen(false);
      fetchUsers();
    } else {
      setErrorMsg(res.error?.message || 'Failed to create user');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const res = await apiFetch(`/api/v1/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });

    if (res.success) {
      fetchUsers();
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-extrabold text-white">Scoped User Directory</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enterprise IOCL Personnel • Scoped by: <span className="font-mono text-orange-400 font-bold">{userCtx?.primaryScope}</span>
          </p>
        </div>

        {hasPermission(PERMISSIONS.USERS_CREATE) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Provision New User</span>
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading user directory...
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80">
                <tr>
                  <th className="p-4">Employee</th>
                  <th className="p-4">Roles</th>
                  <th className="p-4">Primary Scope</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {users.map((u) => {
                  const userScope = u.scopes?.[0]?.scopeLevel || 'UNASSIGNED';
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {u.empCode} • {u.email}
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {u.roles?.map((r: string) => (
                            <span key={r} className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="p-4 font-mono font-bold text-orange-400">
                        {userScope}
                      </td>

                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1 w-max ${
                          u.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'
                        }`}>
                          {u.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          <span>{u.status}</span>
                        </span>
                      </td>

                      <td className="p-4 text-right">
                        {hasPermission(PERMISSIONS.USERS_UPDATE) && (
                          <button
                            onClick={() => handleToggleStatus(u.id, u.status)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 text-[11px] font-mono"
                          >
                            Toggle Status
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provision User Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Provision IOCL User</h2>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Emp Code</label>
                  <input
                    type="text"
                    required
                    placeholder="IOCL-FO-002"
                    value={form.empCode}
                    onChange={e => setForm({ ...form, empCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="Sanjay Kumar"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Official Email</label>
                <input
                  type="email"
                  required
                  placeholder="sanjay@iocl.in"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    required
                    placeholder="9830098300"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Password</label>
                  <input
                    type="password"
                    required
                    placeholder="Password@123"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Assign System Role</label>
                <select
                  value={form.roleCodes[0]}
                  onChange={e => setForm({ ...form, roleCodes: [e.target.value as RoleCode] })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                >
                  <option value={ROLES.ADMIN}>ADMIN (Global)</option>
                  <option value={ROLES.STATE_OFFICE}>STATE_OFFICE</option>
                  <option value={ROLES.DIVISIONAL_OFFICE}>DIVISIONAL_OFFICE</option>
                  <option value={ROLES.FIELD_OFFICER}>FIELD_OFFICER</option>
                  <option value={ROLES.DEALER}>DEALER</option>
                  <option value={ROLES.CSP}>CSP</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold shadow-md"
                >
                  Provision User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
