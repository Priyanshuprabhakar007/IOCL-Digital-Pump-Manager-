import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { State, Division, SalesArea } from '../../shared/types';
import { PERMISSIONS } from '../../shared/constants';
import { Layers, Plus, Building, ChevronRight, AlertCircle } from 'lucide-react';

export const HierarchyPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [states, setStates] = useState<State[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [salesAreas, setSalesAreas] = useState<SalesArea[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'states' | 'divisions' | 'salesAreas'>('states');
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Forms
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [selectedParentId, setSelectedParentId] = useState('');

  const fetchHierarchy = async () => {
    setLoading(true);
    const [stRes, divRes, saRes] = await Promise.all([
      apiFetch<State[]>('/api/v1/hierarchy/states'),
      apiFetch<Division[]>('/api/v1/hierarchy/divisions'),
      apiFetch<SalesArea[]>('/api/v1/hierarchy/sales-areas'),
    ]);

    if (stRes.data) setStates(stRes.data);
    if (divRes.data) setDivisions(divRes.data);
    if (saRes.data) setSalesAreas(saRes.data);

    setLoading(false);
  };

  useEffect(() => {
    fetchHierarchy();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    let url = '';
    let body: any = { code, name, status: 'ACTIVE' };

    if (activeTab === 'states') {
      url = '/api/v1/hierarchy/states';
    } else if (activeTab === 'divisions') {
      url = '/api/v1/hierarchy/divisions';
      body.stateId = selectedParentId;
    } else {
      url = '/api/v1/hierarchy/sales-areas';
      body.divisionId = selectedParentId;
    }

    const res = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (res.success) {
      setModalOpen(false);
      setCode('');
      setName('');
      setSelectedParentId('');
      fetchHierarchy();
    } else {
      setErrorMsg(res.error?.message || 'Failed to create entity');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl font-extrabold text-white">Organizational Hierarchy</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Admin → State Office → Divisional Office → Sales Area / Field Officer → Retail Outlet
          </p>
        </div>

        {hasPermission(PERMISSIONS.HIERARCHY_WRITE) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Hierarchy Unit</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('states')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors ${
            activeTab === 'states' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white bg-slate-800'
          }`}
        >
          State Offices ({states.length})
        </button>

        <button
          onClick={() => setActiveTab('divisions')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors ${
            activeTab === 'divisions' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white bg-slate-800'
          }`}
        >
          Divisional Offices ({divisions.length})
        </button>

        <button
          onClick={() => setActiveTab('salesAreas')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors ${
            activeTab === 'salesAreas' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white bg-slate-800'
          }`}
        >
          Sales Areas ({salesAreas.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading hierarchy structural units...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTab === 'states' && states.map(s => (
            <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-orange-400">{s.code}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{s.status}</span>
              </div>
              <h3 className="font-extrabold text-sm text-white">{s.name}</h3>
              <p className="text-[11px] text-slate-400 font-mono">ID: {s.id}</p>
            </div>
          ))}

          {activeTab === 'divisions' && divisions.map(d => (
            <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-cyan-400">{d.code}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{d.status}</span>
              </div>
              <h3 className="font-extrabold text-sm text-white">{d.name}</h3>
              <p className="text-[11px] text-slate-400 font-mono">Parent State: <strong className="text-white">{d.stateName || d.stateId}</strong></p>
            </div>
          ))}

          {activeTab === 'salesAreas' && salesAreas.map(sa => (
            <div key={sa.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-emerald-400">{sa.code}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">{sa.status}</span>
              </div>
              <h3 className="font-extrabold text-sm text-white">{sa.name}</h3>
              <p className="text-[11px] text-slate-400 font-mono">Parent Division: <strong className="text-white">{sa.divisionName || sa.divisionId}</strong></p>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white capitalize">Add {activeTab.replace('s', '')}</h2>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              {activeTab === 'divisions' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Parent State Office</label>
                  <select
                    required
                    value={selectedParentId}
                    onChange={e => setSelectedParentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  >
                    <option value="">-- Choose State --</option>
                    {states.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </select>
                </div>
              )}

              {activeTab === 'salesAreas' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Parent Divisional Office</label>
                  <select
                    required
                    value={selectedParentId}
                    onChange={e => setSelectedParentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                  >
                    <option value="">-- Choose Division --</option>
                    {divisions.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Code</label>
                <input
                  type="text"
                  required
                  placeholder="CODE-001"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="Unit Name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
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
                  Create Unit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
