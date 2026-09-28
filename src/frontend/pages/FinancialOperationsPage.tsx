import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RetailOutlet,
  OperationalShift,
  ProductPrice,
  CreditParty,
  ShiftCollection,
  CashHandover,
  BankDeposit,
  ShiftFinancialSummary,
  Product,
  CollectionType
} from '../../shared/types';
import {
  Banknote,
  Building2,
  Clock,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Wallet,
  Landmark,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  FileText,
  UserPlus,
  History,
  Lock,
  ChevronRight,
  Trash2,
  CheckCircle,
  XCircle,
  Camera
} from 'lucide-react';
import { formatPaiseToMoney } from '../../shared/financialUtils';
import { PERMISSIONS } from '../../shared/constants';

export const FinancialOperationsPage: React.FC = () => {
  const { userCtx, hasPermission } = useAuth();
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState(true);

  const [shiftsList, setShiftsList] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<OperationalShift | null>(null);

  const [activeTab, setActiveTab] = useState<'collections' | 'credit-parties' | 'handovers' | 'deposits' | 'prices' | 'reconciliation'>('collections');

  const [products, setProducts] = useState<Product[]>([]);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [creditParties, setCreditParties] = useState<CreditParty[]>([]);
  const [collections, setCollections] = useState<ShiftCollection[]>([]);
  const [handovers, setHandovers] = useState<CashHandover[]>([]);
  const [deposits, setDeposits] = useState<BankDeposit[]>([]);
  const [summary, setSummary] = useState<ShiftFinancialSummary | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modals
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [varianceReason, setVarianceReason] = useState('');

  // Load Outlets
  useEffect(() => {
    const loadOutlets = async () => {
      setLoadingOutlets(true);
      const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
      if (res.success && res.data && res.data.length > 0) {
        setOutlets(res.data);
        setSelectedOutletId(res.data[0].id);
      }
      setLoadingOutlets(false);
    };
    loadOutlets();
  }, []);

  // Load shifts for selected outlet
  useEffect(() => {
    if (!selectedOutletId) return;
    const loadShifts = async () => {
      const res = await apiFetch<OperationalShift[]>(`/api/v1/outlets/${selectedOutletId}/shifts`);
      if (res.success && res.data) {
        setShiftsList(res.data);
        if (res.data.length > 0 && !selectedShiftId) {
          setSelectedShiftId(res.data[0].id);
        }
      }
    };
    loadShifts();
  }, [selectedOutletId]);

  const refreshData = async () => {
    if (!selectedOutletId) return;
    setLoadingData(true);
    setActionError(null);

    const promises: Promise<any>[] = [];
    
    // Master data
    promises.push(apiFetch<ProductPrice[]>(`/api/v1/outlets/${selectedOutletId}/product-prices`));
    promises.push(apiFetch<CreditParty[]>(`/api/v1/outlets/${selectedOutletId}/credit-parties`));
    promises.push(apiFetch<Product[]>('/api/v1/products'));

    if (selectedShiftId) {
      promises.push(apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}`));
      promises.push(apiFetch<ShiftCollection[]>(`/api/v1/shifts/${selectedShiftId}/collections`));
      promises.push(apiFetch<CashHandover[]>(`/api/v1/shifts/${selectedShiftId}/cash-handovers`));
      promises.push(apiFetch<BankDeposit[]>(`/api/v1/shifts/${selectedShiftId}/bank-deposits`));
      promises.push(apiFetch<ShiftFinancialSummary>(`/api/v1/shifts/${selectedShiftId}/financial-summary`));
    }

    const results = await Promise.all(promises);
    
    if (results[0].success) setPrices(results[0].data);
    if (results[1].success) setCreditParties(results[1].data);
    if (results[2].success) setProducts(results[2].data.filter((p: Product) => p.unit === 'LITRE'));

    if (selectedShiftId && results[3]) {
      if (results[3].success) setSelectedShift(results[3].data);
      if (results[4].success) setCollections(results[4].data);
      if (results[5].success) setHandovers(results[5].data);
      if (results[6].success) setDeposits(results[6].data);
      if (results[7].success) setSummary(results[7].data);
    }

    setLoadingData(false);
  };

  useEffect(() => {
    refreshData();
  }, [selectedOutletId, selectedShiftId]);

  const handleCreateCollection = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      collectionType: formData.get('collectionType'),
      amount: formData.get('amount'),
      creditPartyId: formData.get('creditPartyId') || null,
      provider: formData.get('provider') || null,
      referenceNumber: formData.get('referenceNumber') || null,
      collectedAt: new Date().toISOString(),
      notes: formData.get('notes') || null,
    };

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/collections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success) {
      setActionSuccess('Collection recorded');
      setShowCollectionModal(false);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to record collection');
    }
  };

  const handleCreateHandover = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      amount: formData.get('amount'),
      handedOverAt: new Date().toISOString(),
      notes: formData.get('notes') || null,
    };

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/cash-handovers`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success) {
      setActionSuccess('Handover recorded');
      setShowHandoverModal(false);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to record handover');
    }
  };

  const handleCreateDeposit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      depositChannel: formData.get('depositChannel'),
      amount: formData.get('amount'),
      depositDate: formData.get('depositDate'),
      referenceNumber: formData.get('referenceNumber') || null,
      documentId: formData.get('documentId') || null,
    };

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/bank-deposits`, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.success) {
      setActionSuccess('Deposit submitted');
      setShowDepositModal(false);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to submit deposit');
    }
  };

  const handleReconcile = async () => {
    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/financial-reconcile`, {
      method: 'POST',
      body: JSON.stringify({ varianceReason }),
    });

    if (res.success) {
      setActionSuccess('Financial reconciliation performed');
      setShowReconcileModal(false);
      setVarianceReason('');
      refreshData();
    } else {
      setActionError(res.error?.message || 'Reconciliation failed');
    }
  };

  const handleAcknowledgeHandover = async (id: string, status: 'ACKNOWLEDGED' | 'DISPUTED') => {
    const res = await apiFetch(`/api/v1/cash-handovers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    if (res.success) {
      setActionSuccess(`Handover ${status.toLowerCase()}`);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to update handover status');
    }
  };

  const handleVerifyDeposit = async (id: string, status: 'VERIFIED' | 'REJECTED', reason?: string) => {
    const res = await apiFetch(`/api/v1/bank-deposits/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, rejectionReason: reason }),
    });

    if (res.success) {
      setActionSuccess(`Deposit ${status.toLowerCase()}`);
      refreshData();
    } else {
      setActionError(res.error?.message || 'Failed to update deposit status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Selectors */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 rounded-xl border border-orange-500/20">
              <Banknote className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">Financial Operations</h1>
              <p className="text-xs text-slate-400">Revenue, collections, handovers and reconciliation</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none"
            >
              {outlets.map(o => (
                <option key={o.id} value={o.id}>{o.roCode} — {o.name}</option>
              ))}
            </select>

            <select
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none"
            >
              <option value="">Select Shift...</option>
              {shiftsList.map(s => (
                <option key={s.id} value={s.id}>{s.businessDate} ({s.shiftTemplateCode})</option>
              ))}
            </select>

            <button
              onClick={refreshData}
              className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${loadingData ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-6 flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar border-t border-slate-800 pt-4">
          <button
            onClick={() => setActiveTab('collections')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'collections' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Collections
          </button>
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'reconciliation' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Reconciliation
          </button>
          <button
            onClick={() => setActiveTab('handovers')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'handovers' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Cash Handover
          </button>
          <button
            onClick={() => setActiveTab('deposits')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'deposits' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Bank Deposits
          </button>
          {hasPermission(PERMISSIONS.CREDIT_PARTIES_READ) && (
            <button
              onClick={() => setActiveTab('credit-parties')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'credit-parties' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Credit Parties
            </button>
          )}
          {hasPermission(PERMISSIONS.PRODUCT_PRICES_READ) && (
            <button
              onClick={() => setActiveTab('prices')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'prices' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              Price Master
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> <span>{actionError}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-6">
        {activeTab === 'collections' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Shift Collections</h2>
              {selectedShift?.status === 'OPEN' && (
                <button
                  onClick={() => setShowCollectionModal(true)}
                  className="px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Add Collection
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map(c => (
                <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2 relative group">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-orange-400 border border-slate-700 uppercase">
                      {c.collectionType.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(c.collectedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xl font-black text-white font-mono">
                    ₹ {c.amountStr}
                  </div>
                  {c.creditPartyNameSnapshot && (
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      {c.creditPartyNameSnapshot} ({c.creditPartyCodeSnapshot})
                    </div>
                  )}
                  {c.provider && (
                    <div className="text-[10px] text-slate-500">
                      {c.provider} {c.referenceNumber && `• ${c.referenceNumber}`}
                    </div>
                  )}
                  {selectedShift?.status === 'OPEN' && (
                    <button
                      onClick={async () => {
                        if (confirm('Delete this collection?')) {
                          await apiFetch(`/api/v1/collections/${c.id}`, { method: 'DELETE' });
                          refreshData();
                        }
                      }}
                      className="absolute top-2 right-2 p-1.5 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {collections.length === 0 && (
                <div className="md:col-span-2 lg:col-span-3 py-12 text-center text-slate-500 italic bg-slate-900/50 border border-dashed border-slate-800 rounded-2xl">
                  No collections recorded for this shift
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reconciliation' && summary && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Sales Revenue */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Authoritative Sales Revenue</h3>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="space-y-3">
                  {summary.salesRevenue.byProduct.map(p => (
                    <div key={p.productId} className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                      <div className="font-mono">
                        <div className="text-white font-bold">{p.productName}</div>
                        <div className="text-slate-500">{p.quantityStr} {p.unit} @ ₹{p.pricePerUnitStr}</div>
                      </div>
                      <div className="text-white font-bold font-mono text-sm">₹{p.revenueStr}</div>
                    </div>
                  ))}
                  <div className="pt-2 flex items-center justify-between font-black text-white text-lg font-mono">
                    <span>TOTAL FUEL</span>
                    <span className="text-orange-500">₹{summary.salesRevenue.fuelTotalStr}</span>
                  </div>
                </div>
              </div>

              {/* Collections Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Collections Breakdown</h3>
                  <Wallet className="w-4 h-4 text-orange-500" />
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Cash:</span>
                    <span className="text-white">₹{summary.collections.cashStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">POS Cards:</span>
                    <span className="text-white">₹{summary.collections.posCardStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">UPI Payments:</span>
                    <span className="text-white">₹{summary.collections.upiStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Fleet Cards:</span>
                    <span className="text-white">₹{summary.collections.fleetCardStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Credit Sales:</span>
                    <span className="text-white">₹{summary.collections.creditSalesStr}</span>
                  </div>
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Direct Bank Drops:</span>
                    <span className="text-white">₹{summary.collections.directBankDropStr}</span>
                  </div>
                  <div className="pt-2 flex items-center justify-between font-black text-white text-lg font-mono border-t border-slate-800">
                    <span>TOTAL</span>
                    <span className="text-emerald-400">₹{summary.collections.totalStr}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Variance & Status */}
            <div className={`p-6 rounded-2xl border-2 flex flex-col md:flex-row items-center justify-between gap-6 ${
              summary.variancePaise === 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 
              summary.variancePaise > 0 ? 'bg-rose-500/5 border-rose-500/20' : 'bg-amber-500/5 border-amber-500/20'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-2xl ${
                  summary.variancePaise === 0 ? 'bg-emerald-500/20 text-emerald-400' :
                  summary.variancePaise > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {summary.variancePaise === 0 ? <CheckCircle2 className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 font-mono">Sales vs Collections Variance</div>
                  <div className={`text-3xl font-black font-mono ${
                    summary.variancePaise === 0 ? 'text-emerald-400' :
                    summary.variancePaise > 0 ? 'text-rose-400' : 'text-amber-400'
                  }`}>
                    ₹ {summary.varianceStr}
                  </div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                    Status: {summary.varianceStatus || 'PENDING'}
                  </div>
                </div>
              </div>

              {selectedShift?.status === 'OPEN' && (
                <button
                  onClick={() => {
                    setVarianceReason(summary.varianceReason || '');
                    setShowReconcileModal(true);
                  }}
                  className="px-6 py-3 bg-white text-slate-950 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors shadow-xl"
                >
                  Confirm Reconciliation
                </button>
              )}
            </div>

            {summary.varianceReason && (
              <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl">
                 <div className="text-[10px] font-bold text-slate-500 uppercase font-mono mb-1">Variance Reason</div>
                 <div className="text-sm text-slate-300 italic">"{summary.varianceReason}"</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'handovers' && (
          <div className="space-y-4">
             <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Cash Handovers</h2>
              {selectedShift?.status === 'OPEN' && (
                <button
                  onClick={() => setShowHandoverModal(true)}
                  className="px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Record Handover
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {handovers.map(h => (
                <div key={h.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-black text-white font-mono">₹ {h.amountStr}</div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                      h.status === 'PENDING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                      h.status === 'ACKNOWLEDGED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                      'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}>
                      {h.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>Handed over at: {new Date(h.handedOverAt).toLocaleString()}</div>
                    {h.receivedAt && <div>Acknowledged at: {new Date(h.receivedAt).toLocaleString()}</div>}
                  </div>
                  {h.status === 'PENDING' && hasPermission(PERMISSIONS.CASH_HANDOVER_ACKNOWLEDGE) && (
                    <div className="flex gap-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => handleAcknowledgeHandover(h.id, 'ACKNOWLEDGED')}
                        className="flex-1 px-3 py-2 bg-emerald-600/20 text-emerald-400 rounded-lg text-[10px] font-bold border border-emerald-600/30 hover:bg-emerald-600 hover:text-white transition-all"
                      >
                        Acknowledge Receipt
                      </button>
                      <button
                         onClick={() => handleAcknowledgeHandover(h.id, 'DISPUTED')}
                        className="flex-1 px-3 py-2 bg-rose-600/20 text-rose-400 rounded-lg text-[10px] font-bold border border-rose-600/30 hover:bg-rose-600 hover:text-white transition-all"
                      >
                        Dispute Amount
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Bank Deposits</h2>
              <button
                onClick={() => setShowDepositModal(true)}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> New Deposit
              </button>
            </div>

            {summary && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Cash Collected (Sales)</div>
                  <div className="text-2xl font-black text-white font-mono">₹ {summary.cashDepositControl.cashCollectedStr}</div>
                </div>
                <div className="w-px h-10 bg-slate-800 hidden md:block" />
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Verified in Bank</div>
                  <div className="text-2xl font-black text-emerald-400 font-mono">₹ {summary.cashDepositControl.verifiedCashDepositedStr}</div>
                </div>
                <div className="w-px h-10 bg-slate-800 hidden md:block" />
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Pending Deposit</div>
                  <div className={`text-2xl font-black font-mono ${summary.cashDepositControl.pendingCashDepositPaise > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    ₹ {summary.cashDepositControl.pendingCashDepositStr}
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {deposits.map(d => (
                    <tr key={d.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-mono">{d.depositDate}</td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{d.depositChannel.replace('_', ' ')}</span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-white font-mono">₹ {d.amountStr}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          d.status === 'SUBMITTED' ? 'bg-amber-500/10 text-amber-400' :
                          d.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-400' :
                          'bg-rose-500/10 text-rose-400'
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono truncate max-w-[120px]">{d.referenceNumber || '—'}</td>
                      <td className="py-3 px-4">
                        {d.status === 'SUBMITTED' && hasPermission(PERMISSIONS.BANK_DEPOSITS_VERIFY) && (
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleVerifyDeposit(d.id, 'VERIFIED')}
                              className="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"
                              title="Verify"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                const reason = prompt('Rejection Reason:');
                                if (reason) handleVerifyDeposit(d.id, 'REJECTED', reason);
                              }}
                              className="p-1.5 bg-rose-600/20 text-rose-400 rounded-lg hover:bg-rose-600 hover:text-white transition-all"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'credit-parties' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Credit Customers / Parties</h2>
              <button
                onClick={() => setShowPartyModal(true)}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Party
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {creditParties.map(p => (
                <div key={p.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-white">{p.partyName}</div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      p.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono">Code: {p.partyCode}</div>
                  <div className="text-xs text-slate-500">Contact: {p.contactName || 'N/A'} • {p.phone || 'N/A'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'prices' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Fuel Price Master</h2>
              <button
                onClick={() => setShowPriceModal(true)}
                className="px-3 py-1.5 bg-orange-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Set New Price
              </button>
            </div>

            <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Product</th>
                    <th className="py-3 px-4">Price / Ltr</th>
                    <th className="py-3 px-4">Effective From</th>
                    <th className="py-3 px-4">Effective To</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {prices.map(p => (
                    <tr key={p.id} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 text-white font-bold">{p.productId}</td>
                      <td className="py-3 px-4 font-mono font-black text-sm text-orange-400">₹ {formatPaiseToMoney(p.pricePaisePerUnit)}</td>
                      <td className="py-3 px-4 font-mono">{p.effectiveFrom}</td>
                      <td className="py-3 px-4 font-mono">{p.effectiveTo || 'Active Indefinitely'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          p.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* MODALS */}
      
      {showCollectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowCollectionModal(false)} />
          <form onSubmit={handleCreateCollection} className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Record Shift Collection</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Collection Type</label>
                <select name="collectionType" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white">
                  <option value="CASH">Physical Cash</option>
                  <option value="POS_CARD">POS Card Swipe</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="FLEET_CARD">Fleet Card</option>
                  <option value="CREDIT_SALE">Credit Sale (Authorized Party)</option>
                  <option value="DIRECT_BANK_DROP">Direct Bank Drop</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Amount (₹)</label>
                <input type="text" name="amount" inputMode="decimal" required placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Credit Party (If Credit Sale)</label>
                <select name="creditPartyId" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white">
                  <option value="">N/A</option>
                  {creditParties.filter(p => p.status === 'ACTIVE').map(p => (
                    <option key={p.id} value={p.id}>{p.partyName} ({p.partyCode})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Provider (e.g. HDFC)</label>
                  <input type="text" name="provider" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Ref / Auth Code</label>
                  <input type="text" name="referenceNumber" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea name="notes" rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCollectionModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-orange-500/20">Record Collection</button>
            </div>
          </form>
        </div>
      )}

      {showHandoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowHandoverModal(false)} />
          <form onSubmit={handleCreateHandover} className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Log Cash Handover</h2>
            <p className="text-xs text-slate-400">Record physical custody transfer of cash to supervisor or next staff.</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Amount (₹)</label>
                <input type="text" name="amount" inputMode="decimal" required placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea name="notes" rows={2} placeholder="Handed over to Supervisor..." className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowHandoverModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20">Confirm Handover</button>
            </div>
          </form>
        </div>
      )}

      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowDepositModal(false)} />
          <form onSubmit={handleCreateDeposit} className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">New Bank Deposit Submission</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Deposit Channel</label>
                <select name="depositChannel" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white">
                  <option value="BANK_BRANCH">Bank Branch (Manual)</option>
                  <option value="CASH_DROP_BOX">Cash Drop Box / CMS</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount (₹)</label>
                  <input type="text" name="amount" inputMode="decimal" required placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Deposit Date</label>
                  <input type="date" name="depositDate" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reference / Acknowledgement #</label>
                <input type="text" name="referenceNumber" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="p-4 border border-dashed border-slate-700 rounded-xl flex flex-col items-center gap-2 text-slate-500">
                <Camera className="w-6 h-6" />
                <span className="text-[10px]">Attach Bank Slip / Proof (via Document Vault)</span>
                <input type="text" name="documentId" placeholder="Document ID (Optional)" className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px]" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowDepositModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold">Submit Deposit</button>
            </div>
          </form>
        </div>
      )}

      {showReconcileModal && summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowReconcileModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Confirm Financial Reconciliation</h2>
            <p className="text-xs text-slate-400">Review variance and provide justification if required.</p>
            
            <div className={`p-4 rounded-xl border font-mono ${summary.variancePaise === 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
              <div className="text-[10px] uppercase font-bold text-slate-500">Net Variance</div>
              <div className="text-xl font-black">₹ {summary.varianceStr}</div>
            </div>

            {summary.variancePaise !== 0 && (
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-bold">Variance Justification <span className="text-rose-500">*</span></label>
                <textarea
                  required
                  value={varianceReason}
                  onChange={(e) => setVarianceReason(e.target.value)}
                  placeholder="Explain shortage/excess (e.g. Coin shortage, system error...)"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowReconcileModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
              <button 
                onClick={handleReconcile}
                disabled={summary.variancePaise !== 0 && varianceReason.length < 3}
                className="px-5 py-2 bg-white text-slate-950 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50"
              >
                Confirm & Reconcile
              </button>
            </div>
          </div>
        </div>
      )}

      {showPartyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowPartyModal(false)} />
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/credit-parties`, {
                method: 'POST',
                body: JSON.stringify({
                  partyCode: formData.get('partyCode'),
                  partyName: formData.get('partyName'),
                  contactName: formData.get('contactName'),
                  phone: formData.get('phone'),
                  status: 'ACTIVE'
                })
              });
              if (res.success) { setShowPartyModal(false); refreshData(); }
            }}
            className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <h2 className="text-lg font-bold text-white">Register Credit Party</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Party Code</label>
                  <input name="partyCode" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Party Name</label>
                  <input name="partyName" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Contact Person</label>
                <input name="contactName" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Phone Number</label>
                <input name="phone" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPartyModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">Register Party</button>
            </div>
          </form>
        </div>
      )}

      {showPriceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowPriceModal(false)} />
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/product-prices`, {
                method: 'POST',
                body: JSON.stringify({
                  productId: formData.get('productId'),
                  pricePaisePerUnit: formData.get('price'),
                  effectiveFrom: formData.get('effectiveFrom'),
                  effectiveTo: formData.get('effectiveTo') || null
                })
              });
              if (res.success) { setShowPriceModal(false); refreshData(); } else { setActionError(res.error?.message || 'Failed to configure price'); }
            }}
            className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4"
          >
            <h2 className="text-lg font-bold text-white">Configure Product Price</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Product Grade</label>
                <select name="productId" required className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white">
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Selling Price (₹ per Ltr)</label>
                <input name="price" type="text" inputMode="decimal" required placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective From</label>
                  <input name="effectiveFrom" type="date" required defaultValue={new Date().toISOString().split('T')[0]} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective To (Optional)</label>
                  <input name="effectiveTo" type="date" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPriceModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
              <button type="submit" className="px-5 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">Set Price</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
