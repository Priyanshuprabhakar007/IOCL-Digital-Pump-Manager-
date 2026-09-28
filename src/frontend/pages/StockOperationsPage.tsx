import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import {
  RetailOutlet,
  OperationalShift,
  OperationalShiftTankSnapshot,
  TankStockReading,
  FuelReceipt,
  ShiftStockSummary,
} from '../../shared/types';
import {
  Droplets,
  Fuel,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calculator,
  ArrowDownRight,
  ArrowUpRight,
  MinusCircle,
} from 'lucide-react';

export const StockOperationsPage: React.FC = () => {
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [shifts, setShifts] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'OPENING' | 'RECEIPTS' | 'CLOSING' | 'RECONCILIATION'>('OPENING');

  const [tankSnapshots, setTankSnapshots] = useState<OperationalShiftTankSnapshot[]>([]);
  const [tankReadings, setTankReadings] = useState<TankStockReading[]>([]);
  const [receipts, setReceipts] = useState<FuelReceipt[]>([]);
  const [reconciliation, setReconciliation] = useState<ShiftStockSummary | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tank Stock Entry Form State
  const [dipForm, setDipForm] = useState<{
    tankId: string;
    readingType: 'OPENING' | 'CLOSING' | 'PRE_RECEIPT' | 'POST_RECEIPT' | 'ADHOC';
    source: 'MANUAL' | 'ATG';
    productDipMm: string;
    waterDipMm: string;
  }>({
    tankId: '',
    readingType: 'OPENING',
    source: 'MANUAL',
    productDipMm: '',
    waterDipMm: '0.000',
  });

  // Fuel Receipt Form State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptForm, setReceiptForm] = useState({
    ttNumber: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    arrivalTime: new Date().toISOString().slice(0, 16),
    sealVerified: true,
    sealExceptionReason: '',
    lineTankId: '',
    invoiceQuantity: '',
    density: '',
    invoiceDensity: '',
    temperature: '',
  });

  // Fetch Outlets on Mount
  useEffect(() => {
    loadOutlets();
  }, []);

  // Fetch Shifts when Outlet changes
  useEffect(() => {
    if (selectedOutletId) {
      loadShifts(selectedOutletId);
    } else {
      setShifts([]);
      setSelectedShiftId('');
    }
  }, [selectedOutletId]);

  // Fetch Shift Data when Shift changes
  useEffect(() => {
    if (selectedShiftId) {
      loadShiftData(selectedShiftId);
    }
  }, [selectedShiftId]);

  const loadOutlets = async () => {
    const res = await apiFetch<RetailOutlet[]>('/api/v1/outlets');
    if (res.success && res.data) {
      setOutlets(res.data);
      if (res.data.length > 0) {
        setSelectedOutletId(res.data[0].id);
      }
    }
  };

  const loadShifts = async (outletId: string) => {
    const res = await apiFetch<OperationalShift[]>(`/api/v1/outlets/${outletId}/shifts`);
    if (res.success && res.data) {
      setShifts(res.data);
      const openShift = res.data.find(s => s.status === 'OPEN');
      if (openShift) {
        setSelectedShiftId(openShift.id);
      } else if (res.data.length > 0) {
        setSelectedShiftId(res.data[0].id);
      } else {
        setSelectedShiftId('');
      }
    }
  };

  const loadShiftData = async (shiftId: string) => {
    setLoading(true);
    setErrorMsg(null);

    const [snapsRes, readingsRes, receiptsRes, reconRes] = await Promise.all([
      apiFetch<OperationalShiftTankSnapshot[]>(`/api/v1/shifts/${shiftId}/tank-snapshots`),
      apiFetch<TankStockReading[]>(`/api/v1/shifts/${shiftId}/tank-readings`),
      apiFetch<FuelReceipt[]>(`/api/v1/shifts/${shiftId}/fuel-receipts`),
      apiFetch<ShiftStockSummary>(`/api/v1/shifts/${shiftId}/stock-reconciliation`),
    ]);

    if (snapsRes.success && snapsRes.data) setTankSnapshots(snapsRes.data);
    if (readingsRes.success && readingsRes.data) setTankReadings(readingsRes.data);
    if (receiptsRes.success && receiptsRes.data) setReceipts(receiptsRes.data);
    if (reconRes.success && reconRes.data) setReconciliation(reconRes.data);

    setLoading(false);
  };

  const handleRecordDip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId || !dipForm.tankId || !dipForm.productDipMm) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/tank-readings`, {
      method: 'POST',
      body: JSON.stringify({
        tankId: dipForm.tankId,
        readingType: activeTab === 'OPENING' ? 'OPENING' : activeTab === 'CLOSING' ? 'CLOSING' : dipForm.readingType,
        source: dipForm.source,
        productDipMm: dipForm.productDipMm,
        waterDipMm: dipForm.waterDipMm || '0.000',
        recordedAt: new Date().toISOString(),
      }),
    });

    if (res.success) {
      setSuccessMsg(`Recorded ${activeTab} stock dip successfully.`);
      setDipForm({ tankId: '', readingType: 'OPENING', source: 'MANUAL', productDipMm: '', waterDipMm: '0.000' });
      await loadShiftData(selectedShiftId);
    } else {
      setErrorMsg(res.error?.message || 'Failed to record tank reading');
    }
  };

  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShiftId || !receiptForm.lineTankId) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    const tank = tankSnapshots.find(t => t.tankId === receiptForm.lineTankId);
    if (!tank) return;

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/fuel-receipts`, {
      method: 'POST',
      body: JSON.stringify({
        ttNumber: receiptForm.ttNumber,
        invoiceNumber: receiptForm.invoiceNumber,
        invoiceDate: receiptForm.invoiceDate,
        arrivalAt: receiptForm.arrivalTime,
        sealVerified: receiptForm.sealVerified,
        sealExceptionReason: receiptForm.sealVerified ? null : receiptForm.sealExceptionReason,
        lines: [
          {
            tankId: receiptForm.lineTankId,
            productId: tank.productId,
            invoiceQuantity: receiptForm.invoiceQuantity,
            density: receiptForm.density || null,
            invoiceDensity: receiptForm.invoiceDensity || null,
            temperature: receiptForm.temperature || null,
          },
        ],
      }),
    });

    if (res.success) {
      setSuccessMsg('Fuel receipt created successfully');
      setShowReceiptModal(false);
      setReceiptForm({
        ttNumber: '',
        invoiceNumber: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        arrivalTime: new Date().toISOString().slice(0, 16),
        sealVerified: true,
        sealExceptionReason: '',
        lineTankId: '',
        invoiceQuantity: '',
        density: '',
        invoiceDensity: '',
        temperature: '',
      });
      await loadShiftData(selectedShiftId);
    } else {
      setErrorMsg(res.error?.message || 'Failed to create fuel receipt');
    }
  };

  const handleComputeReconciliation = async () => {
    if (!selectedShiftId) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/stock-reconciliation/compute`, {
      method: 'POST',
    });

    if (res.success) {
      setSuccessMsg('Reconciliation computed and saved.');
      await loadShiftData(selectedShiftId);
    } else {
      setErrorMsg(res.error?.message || 'Reconciliation compute failed');
    }
  };

  const currentShift = shifts.find(s => s.id === selectedShiftId);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Droplets className="w-6 h-6 text-orange-500" />
            Stock & Decantation Operations
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Tank stock dips, tanker receipts, quality density verification, and authoritative reconciliation
          </p>
        </div>

        <button
          onClick={() => selectedShiftId && loadShiftData(selectedShiftId)}
          className="self-start sm:self-auto px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Selectors Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Retail Outlet
          </label>
          <select
            value={selectedOutletId}
            onChange={e => setSelectedOutletId(e.target.value)}
            className="w-full bg-slate-800 text-white text-sm font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
          >
            {outlets.map(o => (
              <option key={o.id} value={o.id}>
                {o.roCode} - {o.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Operational Shift
          </label>
          <select
            value={selectedShiftId}
            onChange={e => setSelectedShiftId(e.target.value)}
            className="w-full bg-slate-800 text-white text-sm font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
          >
            {shifts.length === 0 ? (
              <option value="">No shifts available</option>
            ) : (
              shifts.map(s => (
                <option key={s.id} value={s.id}>
                  {s.businessDate} ({s.status})
                </option>
              ))
            )}
          </select>
        </div>

        {currentShift && (
          <div className="flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/50 self-end">
            <span className="text-slate-400">Status:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                currentShift.status === 'OPEN'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-700 text-slate-300'
              }`}
            >
              {currentShift.status}
            </span>
          </div>
        )}
      </div>

      {/* Error & Success Messages */}
      {errorMsg && (
        <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Operations Navigation Tabs */}
      <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-none">
        {[
          { id: 'OPENING', label: '1. Opening Stock', icon: Droplets },
          { id: 'RECEIPTS', label: '2. Fuel Receipts', icon: Fuel },
          { id: 'CLOSING', label: '3. Closing Stock', icon: Droplets },
          { id: 'RECONCILIATION', label: '4. Reconciliation', icon: Calculator },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-3 text-xs md:text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-orange-500 text-orange-400 bg-orange-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content: OPENING & CLOSING STOCK */}
      {(activeTab === 'OPENING' || activeTab === 'CLOSING') && (
        <div className="space-y-6">
          {/* Record Dip Form */}
          {currentShift?.status === 'OPEN' && (
            <form onSubmit={handleRecordDip} className="bg-slate-900/90 p-4 md:p-5 rounded-xl border border-slate-800 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Droplets className="w-4 h-4 text-orange-500" />
                Record {activeTab} Dip Reading
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Tank</label>
                  <select
                    value={dipForm.tankId}
                    onChange={e => setDipForm({ ...dipForm, tankId: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="">Select Tank</option>
                    {tankSnapshots.map(t => (
                      <option key={t.tankId} value={t.tankId}>
                        Tank #{t.tankNumber} ({t.productCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Source</label>
                  <select
                    value={dipForm.source}
                    onChange={e => setDipForm({ ...dipForm, source: e.target.value as any })}
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="MANUAL">MANUAL DIP</option>
                    <option value="ATG">AUTOMATIC TANK GAUGE (ATG)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Product Dip (mm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 1250.000"
                    value={dipForm.productDipMm}
                    onChange={e => setDipForm({ ...dipForm, productDipMm: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Water Dip (mm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 0.000"
                    value={dipForm.waterDipMm}
                    onChange={e => setDipForm({ ...dipForm, waterDipMm: e.target.value })}
                    className="w-full bg-slate-800 text-white text-xs font-semibold rounded-lg p-2.5 border border-slate-700 focus:border-orange-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20"
                >
                  Save {activeTab} Reading
                </button>
              </div>
            </form>
          )}

          {/* Snapshot Tanks Readings Table */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {activeTab} Tank Stock Dips
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800/80 text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                  <tr>
                    <th className="p-3">Tank #</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Product Dip (mm)</th>
                    <th className="p-3">Water Dip (mm)</th>
                    <th className="p-3 text-right">Gross Vol (L)</th>
                    <th className="p-3 text-right">Water Vol (L)</th>
                    <th className="p-3 text-right">Net Product Stock (L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {tankSnapshots.map(ts => {
                    const reading = tankReadings.find(r => r.tankId === ts.tankId && r.readingType === activeTab);
                    return (
                      <tr key={ts.tankId} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-white">Tank #{ts.tankNumber}</td>
                        <td className="p-3">{ts.productCode} - {ts.productName}</td>
                        <td className="p-3 text-slate-400">{reading ? reading.source : '-'}</td>
                        <td className="p-3 text-slate-200">{reading ? reading.productDipMmStr : '-'}</td>
                        <td className="p-3 text-slate-200">{reading ? reading.waterDipMmStr : '-'}</td>
                        <td className="p-3 text-right text-slate-300">{reading ? reading.grossObservedVolumeStr : '-'}</td>
                        <td className="p-3 text-right text-slate-400">{reading ? reading.waterVolumeStr : '-'}</td>
                        <td className="p-3 text-right font-bold text-orange-400">
                          {reading ? `${reading.netProductVolumeStr} L` : <span className="text-red-400 font-normal">MISSING</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: FUEL RECEIPTS */}
      {activeTab === 'RECEIPTS' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Fuel className="w-4 h-4 text-orange-500" />
              Tanker Fuel Deliveries
            </h3>
            {currentShift?.status === 'OPEN' && (
              <button
                onClick={() => setShowReceiptModal(true)}
                className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20 flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Fuel Receipt
              </button>
            )}
          </div>

          {receipts.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-400 text-xs font-mono">
              No fuel receipts recorded for this shift.
            </div>
          ) : (
            receipts.map(rcpt => (
              <div key={rcpt.id} className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs font-bold text-white font-mono">
                      TT: {rcpt.ttNumber} | Inv: {rcpt.invoiceNumber}
                    </span>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Inv Date: {rcpt.invoiceDate} | Arrived: {new Date(rcpt.arrivalAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-extrabold rounded font-mono ${
                        rcpt.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : rcpt.status === 'CANCELLED'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {rcpt.status}
                    </span>
                  </div>
                </div>

                {/* Lines Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 font-mono">
                    <thead className="bg-slate-800/80 text-[10px] text-slate-400 uppercase">
                      <tr>
                        <th className="p-2.5">Tank</th>
                        <th className="p-2.5">Product</th>
                        <th className="p-2.5 text-right">Invoice Qty (L)</th>
                        <th className="p-2.5 text-right">Measured Qty (L)</th>
                        <th className="p-2.5 text-right">Variance (L)</th>
                        <th className="p-2.5 text-right">Obs Density</th>
                        <th className="p-2.5 text-right">Inv Density</th>
                        <th className="p-2.5">Quality Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {rcpt.lines?.map(l => (
                        <tr key={l.id}>
                          <td className="p-2.5 font-bold text-white">Tank #{l.tankNumber}</td>
                          <td className="p-2.5">{l.productCode}</td>
                          <td className="p-2.5 text-right">{l.invoiceQuantityStr} L</td>
                          <td className="p-2.5 text-right font-bold text-slate-200">
                            {l.measuredReceivedQuantityStr ? `${l.measuredReceivedQuantityStr} L` : '-'}
                          </td>
                          <td className="p-2.5 text-right text-orange-400">
                            {l.receiptVarianceStr ? `${l.receiptVarianceStr} L` : '-'}
                          </td>
                          <td className="p-2.5 text-right">{l.densityStr || '-'}</td>
                          <td className="p-2.5 text-right">{l.invoiceDensityStr || '-'}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                l.qualityStatus === 'PASS'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : l.qualityStatus === 'OUT_OF_TOLERANCE'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {l.qualityStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab Content: RECONCILIATION */}
      {activeTab === 'RECONCILIATION' && (
        <div className="space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Calculator className="w-4 h-4 text-orange-500" />
                Shift Stock Reconciliation
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Theoretical Closing = Opening + Receipts - Sales
              </p>
            </div>

            {currentShift?.status === 'OPEN' && (
              <button
                onClick={handleComputeReconciliation}
                className="px-3.5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-orange-500/20 flex items-center gap-1.5"
              >
                <Calculator className="w-4 h-4" />
                Compute Reconciliation
              </button>
            )}
          </div>

          {!reconciliation ? (
            <div className="p-8 text-center bg-slate-900/60 rounded-xl border border-slate-800 text-slate-400 text-xs font-mono">
              No reconciliation report available yet. Enter Opening/Closing dips and click Compute.
            </div>
          ) : (
            <div className="space-y-6">
              {/* By Tank Table */}
              <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-3.5 bg-slate-800/80 border-b border-slate-800 font-bold text-xs text-white uppercase">
                  Tank-Level Reconciliation
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 font-mono">
                    <thead className="bg-slate-800/50 text-[10px] text-slate-400 uppercase">
                      <tr>
                        <th className="p-3">Tank #</th>
                        <th className="p-3">Product</th>
                        <th className="p-3 text-right">Opening Stock</th>
                        <th className="p-3 text-right">+ Receipts</th>
                        <th className="p-3 text-right">- Meter Sales</th>
                        <th className="p-3 text-right">= Theoretical</th>
                        <th className="p-3 text-right">Physical Closing</th>
                        <th className="p-3 text-right">Variance</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reconciliation.byTank.map(t => (
                        <tr key={t.tankId} className="hover:bg-slate-800/30">
                          <td className="p-3 font-bold text-white">Tank #{t.tankNumber}</td>
                          <td className="p-3">{t.productCode}</td>
                          <td className="p-3 text-right">{t.openingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right text-emerald-400">+{t.receiptQuantityStr} L</td>
                          <td className="p-3 text-right text-amber-400">-{t.salesQuantityStr} L</td>
                          <td className="p-3 text-right font-bold text-slate-200">{t.theoreticalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-white">{t.physicalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-orange-400">{t.varianceStr ?? '-'} L</td>
                          <td className="p-3 text-center">
                            {t.varianceStatus ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  t.varianceStatus === 'BALANCED'
                                    ? 'bg-slate-700 text-slate-300'
                                    : t.varianceStatus === 'GAIN'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {t.varianceStatus}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* By Product Summary */}
              <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
                <div className="p-3.5 bg-slate-800/80 border-b border-slate-800 font-bold text-xs text-white uppercase">
                  Product-Level Reconciliation Summary
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300 font-mono">
                    <thead className="bg-slate-800/50 text-[10px] text-slate-400 uppercase">
                      <tr>
                        <th className="p-3">Product</th>
                        <th className="p-3 text-right">Opening Total</th>
                        <th className="p-3 text-right">Receipts Total</th>
                        <th className="p-3 text-right">Sales Total</th>
                        <th className="p-3 text-right">Theoretical</th>
                        <th className="p-3 text-right">Physical Total</th>
                        <th className="p-3 text-right">Total Variance</th>
                        <th className="p-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {reconciliation.byProduct.map(p => (
                        <tr key={p.productId} className="hover:bg-slate-800/30">
                          <td className="p-3 font-bold text-white">{p.productCode} - {p.productName}</td>
                          <td className="p-3 text-right">{p.openingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right text-emerald-400">+{p.receiptQuantityStr} L</td>
                          <td className="p-3 text-right text-amber-400">-{p.salesQuantityStr} L</td>
                          <td className="p-3 text-right font-bold text-slate-200">{p.theoreticalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-white">{p.physicalClosingStockStr ?? '-'} L</td>
                          <td className="p-3 text-right font-bold text-orange-400">{p.varianceStr ?? '-'} L</td>
                          <td className="p-3 text-center">
                            {p.varianceStatus ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                  p.varianceStatus === 'BALANCED'
                                    ? 'bg-slate-700 text-slate-300'
                                    : p.varianceStatus === 'GAIN'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}
                              >
                                {p.varianceStatus}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fuel Receipt Creation Modal */}
      {showReceiptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Fuel className="w-5 h-5 text-orange-500" />
              Record Tanker Fuel Receipt
            </h3>

            <form onSubmit={handleCreateReceipt} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">TT Number</label>
                  <input
                    type="text"
                    placeholder="e.g. TT-9988"
                    value={receiptForm.ttNumber}
                    onChange={e => setReceiptForm({ ...receiptForm, ttNumber: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Number</label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-001"
                    value={receiptForm.invoiceNumber}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceNumber: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={receiptForm.invoiceDate}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceDate: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Arrival Time</label>
                  <input
                    type="datetime-local"
                    value={receiptForm.arrivalTime}
                    onChange={e => setReceiptForm({ ...receiptForm, arrivalTime: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-400 uppercase mb-1">Receiving Tank</label>
                <select
                  value={receiptForm.lineTankId}
                  onChange={e => setReceiptForm({ ...receiptForm, lineTankId: e.target.value })}
                  required
                  className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                >
                  <option value="">Select Tank</option>
                  {tankSnapshots.map(t => (
                    <option key={t.tankId} value={t.tankId}>
                      Tank #{t.tankNumber} ({t.productCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Qty (L)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 12000.000"
                    value={receiptForm.invoiceQuantity}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceQuantity: e.target.value })}
                    required
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Observed Density</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 745.200"
                    value={receiptForm.density}
                    onChange={e => setReceiptForm({ ...receiptForm, density: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Invoice Density</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 744.000"
                    value={receiptForm.invoiceDensity}
                    onChange={e => setReceiptForm({ ...receiptForm, invoiceDensity: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-400 uppercase mb-1">Temperature (°C)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 29.500"
                    value={receiptForm.temperature}
                    onChange={e => setReceiptForm({ ...receiptForm, temperature: e.target.value })}
                    className="w-full bg-slate-800 text-white rounded-lg p-2.5 border border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg shadow-lg shadow-orange-500/20"
                >
                  Save Receipt Header
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockOperationsPage;
