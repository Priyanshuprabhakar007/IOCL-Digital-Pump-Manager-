import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { RetailOutlet, User } from '../../shared/types';
import { PERMISSIONS } from '../../shared/constants';
import { Building2, Plus, MapPin, UserPlus, Filter, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export const OutletsPage: React.FC = () => {
  const { hasPermission, userCtx } = useAuth();
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedOutlet, setSelectedOutlet] = useState<RetailOutlet | null>(null);

  // Form states for new outlet
  const [form, setForm] = useState({
    roCode: '',
    name: '',
    outletType: 'COCO' as 'COCO' | 'CODO' | 'A_SITE',
    stateId: 'state-wb',
    divisionId: 'div-kol',
    salesAreaId: 'sa-cen',
    address: '',
    city: 'Kolkata',
    district: 'Kolkata',
    pincode: '700001',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  });

  // Form state for assignment
  const [assignUserId, setAssignUserId] = useState('');
  const [assignType, setAssignType] = useState<'DEALER' | 'CSP' | 'INSPECTOR'>('DEALER');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOutlets = async () => {
    setLoading(true);
    const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
    if (res.success && res.data) {
      setOutlets(res.data);
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    const res = await apiFetch<User[]>('/api/v1/users');
    if (res.success && res.data) {
      setUsers(res.data);
    }
  };

  useEffect(() => {
    fetchOutlets();
    fetchUsers();
  }, []);

  const handleCreateOutlet = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const res = await apiFetch<RetailOutlet>('/api/v1/outlets', {
      method: 'POST',
      body: JSON.stringify(form),
    });

    if (res.success) {
      setModalOpen(false);
      fetchOutlets();
    } else {
      setErrorMsg(res.error?.message || 'Failed to create retail outlet');
    }
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutlet) return;
    setErrorMsg(null);

    const res = await apiFetch(`/api/v1/outlets/${selectedOutlet.id}/assignments`, {
      method: 'POST',
      body: JSON.stringify({
        userId: assignUserId,
        assignmentType: assignType,
      }),
    });

    if (res.success) {
      setAssignModalOpen(false);
      fetchOutlets();
    } else {
      setErrorMsg(res.error?.message || 'Failed to assign user to outlet');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl font-extrabold text-white">Retail Outlet Directory</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            IOCL Retail Petrol Pump Outlets • Filtered strictly by backend scope: <span className="font-mono text-orange-400 font-bold">{userCtx?.primaryScope}</span>
          </p>
        </div>

        {hasPermission(PERMISSIONS.OUTLETS_CREATE) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Register New Outlet</span>
          </button>
        )}
      </div>

      {/* Scope Banner */}
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-300">
          <Filter className="w-4 h-4 text-orange-400" />
          <span>Active Scope Constraint: <strong className="text-white font-mono">{userCtx?.primaryScope}</strong></span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">
          Showing {outlets.length} accessible record(s)
        </span>
      </div>

      {/* Outlet Cards / Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading scoped retail outlets...
        </div>
      ) : outlets.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-900/50 space-y-3">
          <Building2 className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No Retail Outlets Accessible</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Either no outlets match your assigned organizational scope ({userCtx?.primaryScope}), or no outlets have been registered yet under this division.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {outlets.map((ro) => (
            <div
              key={ro.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-white">{ro.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/30">
                      {ro.outletType}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    RO Code: <span className="text-white font-bold">{ro.roCode}</span>
                  </div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  ro.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                }`}>
                  {ro.status}
                </span>
              </div>

              {/* Hierarchy Info */}
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 text-[11px] font-mono space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">State Office:</span>
                  <span className="text-slate-200 font-semibold">{ro.stateName || ro.stateId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Division Office:</span>
                  <span className="text-slate-200 font-semibold">{ro.divisionName || ro.divisionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sales Area:</span>
                  <span className="text-slate-200 font-semibold">{ro.salesAreaName || ro.salesAreaId}</span>
                </div>
              </div>

              {/* Address */}
              <div className="text-xs text-slate-400 flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>{ro.address}, {ro.city}, {ro.district} - {ro.pincode}</span>
              </div>

              {/* User Assignments */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                <div className="text-xs font-mono text-slate-400">
                  Assigned Personnel: <span className="text-white font-bold">{ro.assignedUsersCount || 0}</span>
                </div>

                {hasPermission(PERMISSIONS.OUTLETS_UPDATE) && (
                  <button
                    onClick={() => {
                      setSelectedOutlet(ro);
                      setErrorMsg(null);
                      setAssignModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5 text-orange-400" />
                    <span>Assign Personnel</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register New Outlet Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Register Retail Outlet</h2>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateOutlet} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">RO Code</label>
                  <input
                    type="text"
                    required
                    placeholder="RO-110025"
                    value={form.roCode}
                    onChange={e => setForm({ ...form, roCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Outlet Type</label>
                  <select
                    value={form.outletType}
                    onChange={e => setForm({ ...form, outletType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="COCO">COCO (Company Owned)</option>
                    <option value="CODO">CODO (Company Owned Dealer Operated)</option>
                    <option value="A_SITE">A-Site (A-Site Franchisee)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Outlet Name</label>
                <input
                  type="text"
                  required
                  placeholder="New Town Fuel Station"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Address</label>
                <input
                  type="text"
                  required
                  placeholder="Plot 12, Action Area I"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={form.city}
                    onChange={e => setForm({ ...form, city: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">District</label>
                  <input
                    type="text"
                    required
                    value={form.district}
                    onChange={e => setForm({ ...form, district: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Pincode</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={form.pincode}
                    onChange={e => setForm({ ...form, pincode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>
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
                  Register Outlet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign User to Outlet Modal */}
      {assignModalOpen && selectedOutlet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Assign Personnel to Outlet</h2>
            <p className="text-xs text-slate-400">
              Assigning Dealer/CSP to <span className="text-orange-400 font-bold">{selectedOutlet.name}</span> ({selectedOutlet.roCode})
            </p>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAssignUser} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select User</label>
                <select
                  required
                  value={assignUserId}
                  onChange={e => setAssignUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                >
                  <option value="">-- Choose User --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.empCode}) - {u.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Assignment Type</label>
                <select
                  value={assignType}
                  onChange={e => setAssignType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                >
                  <option value="DEALER">DEALER (Retail Outlet Franchisee)</option>
                  <option value="CSP">CSP (Customer Service Provider)</option>
                  <option value="INSPECTOR">INSPECTOR (Field Compliance Officer)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold shadow-md"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
