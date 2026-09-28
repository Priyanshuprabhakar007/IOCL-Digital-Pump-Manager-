import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RetailOutlet,
  OperationalShift,
  ShiftTemplate,
  ShiftEntryGridItem,
  ShiftSalesSummary,
} from '../../shared/types';
import {
  Clock,
  Building2,
  Calendar,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Fuel,
  Sliders,
  Flame,
  ArrowRight,
  TrendingUp,
  FileCheck,
  AlertTriangle,
  FileText,
} from 'lucide-react';

export const ShiftOperationsPage: React.FC = () => {
  const { userCtx } = useAuth();
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [loadingOutlets, setLoadingOutlets] = useState(true);

  // Shifts list & active selection
  const [shiftsList, setShiftsList] = useState<OperationalShift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<OperationalShift | null>(null);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);

  // Workspace View: 'entry' or 'summary'
  const [activeView, setActiveView] = useState<'entry' | 'summary'>('entry');

  // Grid & Summary state
  const [gridItems, setGridItems] = useState<ShiftEntryGridItem[]>([]);
  const [salesSummary, setSalesSummary] = useState<ShiftSalesSummary | null>(null);
  const [loadingShiftData, setLoadingShiftData] = useState(false);

  // Form input rows for the entry grid
  const [readingInputs, setReadingInputs] = useState<Record<string, {
    opening: string;
    closing: string;
    testing: string;
    varianceReason: string;
  }>>({});

  // Modals & Feedback
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [newShiftTemplateId, setNewShiftTemplateId] = useState('');
  const [newShiftDate, setNewShiftDate] = useState(new Date().toISOString().split('T')[0]);
  const [newShiftNotes, setNewShiftNotes] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [unavailModalNozzle, setUnavailModalNozzle] = useState<ShiftEntryGridItem | null>(null);
  const [unavailReason, setUnavailReason] = useState('');

  const [closeConfirmModal, setCloseConfirmModal] = useState(false);
  const [closingSubmitting, setClosingSubmitting] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

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

  // Load Shifts and Templates for selected Outlet
  const loadOutletShifts = async () => {
    if (!selectedOutletId) return;
    const [shiftsRes, tplRes] = await Promise.all([
      apiFetch<OperationalShift[]>(`/api/v1/outlets/${selectedOutletId}/shifts`),
      apiFetch<ShiftTemplate[]>(`/api/v1/outlets/${selectedOutletId}/shift-templates`),
    ]);

    if (shiftsRes.success && shiftsRes.data) {
      setShiftsList(shiftsRes.data);
      if (shiftsRes.data.length > 0 && !selectedShiftId) {
        setSelectedShiftId(shiftsRes.data[0].id);
      }
    }
    if (tplRes.success && tplRes.data) {
      setShiftTemplates(tplRes.data);
      if (tplRes.data.length > 0 && !newShiftTemplateId) {
        setNewShiftTemplateId(tplRes.data[0].id);
      }
    }
  };

  useEffect(() => {
    loadOutletShifts();
  }, [selectedOutletId]);

  // Load Details for Selected Shift
  const loadShiftWorkspace = async () => {
    if (!selectedShiftId) return;
    setLoadingShiftData(true);
    setActionError(null);

    const [shiftRes, gridRes, summaryRes] = await Promise.all([
      apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}`),
      apiFetch<ShiftEntryGridItem[]>(`/api/v1/shifts/${selectedShiftId}/entry-grid`),
      apiFetch<ShiftSalesSummary>(`/api/v1/shifts/${selectedShiftId}/sales-summary`),
    ]);

    if (shiftRes.success && shiftRes.data) {
      setSelectedShift(shiftRes.data);
    }
    if (gridRes.success && gridRes.data) {
      setGridItems(gridRes.data);
      // Initialize inputs map
      const inputs: Record<string, any> = {};
      gridRes.data.forEach(item => {
        inputs[item.nozzle.id] = {
          opening: item.reading ? String(item.reading.openingTotalizer) : String(item.suggestedOpeningTotalizer || 0),
          closing: item.reading ? String(item.reading.closingTotalizer) : '',
          testing: item.reading ? String(item.reading.testingQuantity) : '0',
          varianceReason: item.reading?.varianceReason || '',
        };
      });
      setReadingInputs(inputs);
    }
    if (summaryRes.success && summaryRes.data) {
      setSalesSummary(summaryRes.data);
    }

    setLoadingShiftData(false);
  };

  useEffect(() => {
    loadShiftWorkspace();
  }, [selectedShiftId]);

  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);

    const res = await apiFetch<OperationalShift>(`/api/v1/outlets/${selectedOutletId}/shifts/open`, {
      method: 'POST',
      body: JSON.stringify({
        shiftTemplateId: newShiftTemplateId,
        businessDate: newShiftDate,
        notes: newShiftNotes.trim() || null,
      }),
    });

    setModalSubmitting(false);

    if (res.success && res.data) {
      setOpenShiftModal(false);
      setActionSuccess(`Operational Shift for ${newShiftDate} opened successfully`);
      setTimeout(() => setActionSuccess(null), 4000);
      setSelectedShiftId(res.data.id);
      loadOutletShifts();
    } else {
      setModalError(res.error?.message || 'Failed to open operational shift');
    }
  };

  const handleSaveReading = async (nozzleId: string) => {
    const input = readingInputs[nozzleId];
    if (!input) return;

    const opening = parseFloat(input.opening);
    const closing = parseFloat(input.closing);
    const testing = parseFloat(input.testing || '0');

    if (isNaN(opening) || isNaN(closing) || closing < opening) {
      setActionError('Closing totalizer must be greater than or equal to opening totalizer');
      return;
    }

    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/readings`, {
      method: 'POST',
      body: JSON.stringify({
        nozzleId,
        openingTotalizer: opening,
        closingTotalizer: closing,
        testingQuantity: isNaN(testing) ? 0 : testing,
        varianceReason: input.varianceReason ? input.varianceReason.trim() : null,
      }),
    });

    if (res.success) {
      setActionSuccess('Reading recorded');
      setTimeout(() => setActionSuccess(null), 3000);
      loadShiftWorkspace();
    } else {
      setActionError(res.error?.message || 'Failed to save meter reading');
    }
  };

  const handleRecordUnavailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unavailModalNozzle) return;

    setModalSubmitting(true);
    const res = await apiFetch(`/api/v1/shifts/${selectedShiftId}/nozzle-unavailability`, {
      method: 'POST',
      body: JSON.stringify({
        nozzleId: unavailModalNozzle.nozzle.id,
        reason: unavailReason.trim(),
      }),
    });
    setModalSubmitting(false);

    if (res.success) {
      setUnavailModalNozzle(null);
      setUnavailReason('');
      setActionSuccess('Nozzle marked unavailable for this shift');
      setTimeout(() => setActionSuccess(null), 3000);
      loadShiftWorkspace();
    } else {
      setActionError(res.error?.message || 'Failed to mark nozzle unavailable');
    }
  };

  const handleCloseShift = async () => {
    setClosingSubmitting(true);
    setActionError(null);

    const res = await apiFetch<OperationalShift>(`/api/v1/shifts/${selectedShiftId}/close`, {
      method: 'POST',
    });

    setClosingSubmitting(false);
    setCloseConfirmModal(false);

    if (res.success && res.data) {
      setActionSuccess('Operational shift closed and finalized successfully');
      setTimeout(() => setActionSuccess(null), 4000);
      setSelectedShift(res.data);
      loadOutletShifts();
      loadShiftWorkspace();
    } else {
      setActionError(res.error?.message || 'Failed to close operational shift');
    }
  };

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId);
  const isShiftOpen = selectedShift?.status === 'OPEN';

  return (
    <div className="space-y-6">
      {/* Top Header & Outlet Selector */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-black text-white tracking-tight">
                Daily Shift Operations & Meter Readings
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Authoritative nozzle meter entry, continuity verification, testing calibration deduction, and sales reconciliation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedOutletId}
              onChange={(e) => {
                setSelectedOutletId(e.target.value);
                setSelectedShiftId('');
              }}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none focus:border-orange-500"
            >
              {outlets.map(o => (
                <option key={o.id} value={o.id}>
                  {o.roCode} — {o.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setModalError(null);
                setOpenShiftModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Open New Shift</span>
            </button>
          </div>
        </div>

        {/* Shift selector pills */}
        <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider shrink-0">
            Shifts:
          </span>
          {shiftsList.length === 0 ? (
            <span className="text-xs text-slate-400 italic">No operational shifts opened yet for this outlet</span>
          ) : (
            shiftsList.map(s => {
              const isSelected = s.id === selectedShiftId;
              const isOp = s.status === 'OPEN';
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedShiftId(s.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono transition-all whitespace-nowrap border ${
                    isSelected
                      ? 'bg-slate-800 text-white border-orange-500 shadow-md shadow-orange-500/10'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isOp ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                  <span className="font-bold">{s.businessDate}</span>
                  <span className="text-slate-500">({s.shiftTemplateCode})</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {selectedShift && (
        <>
          {/* Active Shift Banner & Immutability Status */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white font-mono">
                  {selectedShift.businessDate} • {selectedShift.shiftTemplateName} ({selectedShift.shiftTemplateCode})
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider font-mono flex items-center gap-1 ${
                    selectedShift.status === 'OPEN'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : selectedShift.status === 'CLOSED'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                  }`}
                >
                  {selectedShift.status === 'OPEN' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  <span>{selectedShift.status}</span>
                </span>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Started at: {new Date(selectedShift.startedAt).toLocaleTimeString()} • Opened by: {selectedShift.openedByName}
                {selectedShift.closedAt && ` • Closed at: ${new Date(selectedShift.closedAt).toLocaleTimeString()}`}
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Switcher */}
              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveView('entry')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeView === 'entry' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Meter Entry Grid
                </button>
                <button
                  onClick={() => setActiveView('summary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeView === 'summary' ? 'bg-orange-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Sales Summary
                </button>
              </div>

              {/* Close Shift Action Button */}
              {isShiftOpen && (
                <button
                  onClick={() => setCloseConfirmModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Finalize & Close Shift</span>
                </button>
              )}
            </div>
          </div>

          {/* VIEW 1: METER ENTRY GRID */}
          {activeView === 'entry' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                    Authoritative Nozzle Meter Readings
                  </h2>
                  <p className="text-xs text-slate-400">
                    Gross = Closing - Opening. Net = Gross - Testing. Opening variances are audited.
                  </p>
                </div>
                {!isShiftOpen && (
                  <span className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-xl flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Read-Only (Shift Closed)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-xl shadow-black/20">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Nozzle / MPD</th>
                      <th className="py-3 px-3">Fuel Grade</th>
                      <th className="py-3 px-3">Previous Closing</th>
                      <th className="py-3 px-3">Current Opening</th>
                      <th className="py-3 px-3">Closing Reading</th>
                      <th className="py-3 px-3">Testing Qty (L)</th>
                      <th className="py-3 px-3">Gross Sales</th>
                      <th className="py-3 px-3">Net Sales (L)</th>
                      <th className="py-3 px-3">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {gridItems.map((item) => {
                      const nId = item.nozzle.id;
                      const input = readingInputs[nId] || { opening: '0', closing: '', testing: '0', varianceReason: '' };
                      const openingNum = parseFloat(input.opening) || 0;
                      const closingNum = parseFloat(input.closing) || 0;
                      const testingNum = parseFloat(input.testing) || 0;

                      const calculatedGross = closingNum >= openingNum ? Math.round((closingNum - openingNum) * 1000) / 1000 : 0;
                      const calculatedNet = Math.max(0, Math.round((calculatedGross - testingNum) * 1000) / 1000);

                      const hasVariance = item.hasPreviousShift && Math.abs(openingNum - item.suggestedOpeningTotalizer) > 0.001;
                      const isRecorded = Boolean(item.reading);
                      const isUnavailable = Boolean(item.unavailability);

                      return (
                        <tr key={nId} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-white font-mono">
                              Nozzle {item.nozzle.nozzleNumber}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              MPD #{item.nozzle.dispenserNumber}
                            </div>
                          </td>

                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              {item.nozzle.productCode || item.nozzle.productName}
                            </span>
                          </td>

                          <td className="py-3 px-3 font-mono text-slate-400">
                            {item.hasPreviousShift ? item.suggestedOpeningTotalizer.toFixed(2) : 'Initial (0.00)'}
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!isShiftOpen || isUnavailable}
                              value={input.opening}
                              onChange={(e) => {
                                setReadingInputs(prev => ({
                                  ...prev,
                                  [nId]: { ...prev[nId], opening: e.target.value },
                                }));
                              }}
                              className={`w-24 bg-slate-950 border rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none ${
                                hasVariance ? 'border-amber-500 text-amber-300' : 'border-slate-700'
                              } disabled:opacity-50`}
                            />
                            {hasVariance && (
                              <div className="mt-1">
                                <span className="text-[9px] text-amber-400 font-mono block">Variance!</span>
                                <input
                                  type="text"
                                  placeholder="Reason required"
                                  disabled={!isShiftOpen || isUnavailable}
                                  value={input.varianceReason}
                                  onChange={(e) => {
                                    setReadingInputs(prev => ({
                                      ...prev,
                                      [nId]: { ...prev[nId], varianceReason: e.target.value },
                                    }));
                                  }}
                                  className="w-28 bg-slate-950 border border-amber-500/60 rounded px-1.5 py-0.5 text-[10px] text-amber-300 focus:outline-none disabled:opacity-50 mt-0.5"
                                />
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!isShiftOpen || isUnavailable}
                              value={input.closing}
                              onChange={(e) => {
                                setReadingInputs(prev => ({
                                  ...prev,
                                  [nId]: { ...prev[nId], closing: e.target.value },
                                }));
                              }}
                              placeholder="0.00"
                              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
                            />
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!isShiftOpen || isUnavailable}
                              value={input.testing}
                              onChange={(e) => {
                                setReadingInputs(prev => ({
                                  ...prev,
                                  [nId]: { ...prev[nId], testing: e.target.value },
                                }));
                              }}
                              placeholder="0"
                              className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-orange-500 disabled:opacity-50"
                            />
                          </td>

                          <td className="py-3 px-3 font-mono text-slate-300 font-bold">
                            {isUnavailable ? '—' : calculatedGross.toFixed(2)}
                          </td>

                          <td className="py-3 px-3 font-mono text-emerald-400 font-bold text-sm">
                            {isUnavailable ? '—' : calculatedNet.toFixed(2)}
                          </td>

                          <td className="py-3 px-3">
                            {isUnavailable ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                  Unavailable
                                </span>
                                {isShiftOpen && (
                                  <button
                                    onClick={async () => {
                                      await apiFetch(`/api/v1/shifts/${selectedShiftId}/nozzle-unavailability/${nId}`, { method: 'DELETE' });
                                      loadShiftWorkspace();
                                    }}
                                    className="text-[10px] text-slate-400 hover:text-white underline"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {isShiftOpen && (
                                  <>
                                    <button
                                      onClick={() => handleSaveReading(nId)}
                                      className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-[11px] font-bold shadow hover:from-orange-600 hover:to-amber-700"
                                    >
                                      {isRecorded ? 'Update' : 'Save'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setUnavailModalNozzle(item);
                                        setUnavailReason('Maintenance / Dispenser Fault');
                                      }}
                                      className="px-2 py-1 bg-slate-800 text-slate-400 hover:text-rose-400 rounded-lg text-[10px] border border-slate-700"
                                    >
                                      Mark N/A
                                    </button>
                                  </>
                                )}
                                {isRecorded && (
                                  <span title="Reading Recorded">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                  </span>
                                )}
                              </div>
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

          {/* VIEW 2: SALES SUMMARY */}
          {activeView === 'summary' && salesSummary && (
            <div className="space-y-6">
              {/* Grand Totals Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20">
                  <span className="text-slate-500 text-[10px] font-mono uppercase tracking-wider block">
                    Total Gross Sales
                  </span>
                  <div className="text-2xl font-black text-white font-mono mt-1">
                    {salesSummary.totalOutletQuantity.grossQuantity.toLocaleString()} L
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20">
                  <span className="text-slate-500 text-[10px] font-mono uppercase tracking-wider block">
                    Testing & Calibration Deductions
                  </span>
                  <div className="text-2xl font-black text-amber-400 font-mono mt-1">
                    {salesSummary.totalOutletQuantity.testingQuantity.toLocaleString()} L
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/20">
                  <span className="text-slate-500 text-[10px] font-mono uppercase tracking-wider block">
                    Final Net Fuel Sales (Billable)
                  </span>
                  <div className="text-2xl font-black text-emerald-400 font-mono mt-1">
                    {salesSummary.totalOutletQuantity.netQuantity.toLocaleString()} L
                  </div>
                </div>
              </div>

              {/* Breakdown by Product */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mb-3">
                  Fuel Sales by Product Grade
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {salesSummary.byProduct.map(p => (
                    <div key={p.productId} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
                          {p.category}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">Gross: {p.grossQuantity} L</span>
                      </div>
                      <div className="text-sm font-bold text-white mt-2">{p.productName}</div>
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-slate-500 font-mono">NET DISPENSED</span>
                        <span className="text-base font-bold text-emerald-400 font-mono">{p.netQuantity.toLocaleString()} L</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Breakdown by Dispenser */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mb-3">
                  Dispenser Performance Summary
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {salesSummary.byDispenser.map(d => (
                    <div key={d.dispenserId} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-white font-mono">{d.name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          Gross: {d.grossQuantity} L • Testing: {d.testingQuantity} L
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 text-[10px] font-mono block">NET TOTAL</span>
                        <span className="text-base font-bold text-emerald-400 font-mono">{d.netQuantity.toLocaleString()} L</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: Open New Shift */}
      {openShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setOpenShiftModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Open Daily Operational Shift</h2>
            <p className="text-xs text-slate-400 mb-4">
              Initialize a shift instance for {selectedOutlet?.roCode} ({selectedOutlet?.name})
            </p>

            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}

            <form onSubmit={handleOpenShiftSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Shift Configuration Template</label>
                <select
                  value={newShiftTemplateId}
                  onChange={(e) => setNewShiftTemplateId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  {shiftTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code} • {t.startTime} to {t.endTime})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Business Date</label>
                <input
                  type="date"
                  required
                  value={newShiftDate}
                  onChange={(e) => setNewShiftDate(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Operational Shift Notes (Optional)</label>
                <textarea
                  value={newShiftNotes}
                  onChange={(e) => setNewShiftNotes(e.target.value)}
                  placeholder="e.g. Inspector visit scheduled, Tank 1 recalibration..."
                  rows={2}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setOpenShiftModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
                  Cancel
                </button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20">
                  {modalSubmitting ? 'Opening...' : 'Confirm Open Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nozzle Unavailability */}
      {unavailModalNozzle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setUnavailModalNozzle(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-1">
              Mark Nozzle Unavailable
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Dispenser #{unavailModalNozzle.nozzle.dispenserNumber} - Nozzle #{unavailModalNozzle.nozzle.nozzleNumber} ({unavailModalNozzle.nozzle.productCode})
            </p>

            <form onSubmit={handleRecordUnavailability} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">Approved Reason for Unavailability</label>
                <textarea
                  required
                  value={unavailReason}
                  onChange={(e) => setUnavailReason(e.target.value)}
                  placeholder="e.g. Dispenser meter pulser malfunctioning, under repair by OEM technician"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setUnavailModalNozzle(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
                  Cancel
                </button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold">
                  {modalSubmitting ? 'Saving...' : 'Confirm Unavailability'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Shift Close Confirmation */}
      {closeConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setCloseConfirmModal(false)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Finalize & Close Shift?</h2>
                <p className="text-xs text-slate-400">This action enforces strict immutability</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800/80 font-mono">
              <p>• Every active nozzle must have a recorded reading or approved unavailability.</p>
              <p>• Once CLOSED, normal meter totalizers and testing quantities cannot be altered (HTTP 409 SHIFT_CLOSED).</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCloseConfirmModal(false)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                disabled={closingSubmitting}
                onClick={handleCloseShift}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                {closingSubmitting ? 'Validating & Closing...' : 'Confirm Shift Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
