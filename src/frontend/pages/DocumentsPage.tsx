import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Document, RetailOutlet } from '../../shared/types';
import { PERMISSIONS } from '../../shared/constants';
import { FolderGit2, Upload, FileText, Building2, AlertCircle } from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const { hasPermission, userCtx } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [docName, setDocName] = useState('');
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [fileSize, setFileSize] = useState(256000); // Bytes mock

  const fetchDocs = async () => {
    setLoading(true);
    const [docsRes, outletsRes] = await Promise.all([
      apiFetch<Document[]>('/api/v1/documents'),
      apiFetch<RetailOutlet[]>('/api/v1/outlets'),
    ]);

    if (docsRes.data) setDocuments(docsRes.data);
    if (outletsRes.data) setOutlets(outletsRes.data);

    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const handleRegisterDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const res = await apiFetch<Document>('/api/v1/documents', {
      method: 'POST',
      body: JSON.stringify({
        name: docName,
        mimeType: 'application/pdf',
        sizeBytes: fileSize,
        outletId: selectedOutletId || null,
      }),
    });

    if (res.success) {
      setModalOpen(false);
      setDocName('');
      setSelectedOutletId('');
      fetchDocs();
    } else {
      setErrorMsg(res.error?.message || 'Failed to register document');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-extrabold text-white">Document Vault (Cloudflare R2 Foundation)</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Store & retrieve outlet compliance documents, licenses, and inspection records.
          </p>
        </div>

        {hasPermission(PERMISSIONS.DOCUMENTS_WRITE) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <Upload className="w-4 h-4" />
            <span>Register Document</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading document records...
        </div>
      ) : documents.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-800 rounded-2xl p-8 bg-slate-900/50 space-y-3">
          <FolderGit2 className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">No Vault Documents Registered</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Upload retail outlet license copies, explosive department approvals, or calibration certificates.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 shadow-lg">
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-400">
                  {(doc.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>

              <div>
                <h3 className="font-bold text-sm text-white">{doc.name}</h3>
                <div className="text-[11px] text-slate-400 font-mono mt-1">
                  Outlet: <span className="text-slate-200">{doc.outletName || doc.outletId || 'General'}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between">
                <span>R2 Key: {doc.r2Key.slice(0, 16)}...</span>
                <span>By: {doc.uploadedByName}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Register Vault Document</h2>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleRegisterDoc} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Document Title</label>
                <input
                  type="text"
                  required
                  placeholder="PESO License Certificate 2026.pdf"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Associated Outlet</label>
                <select
                  value={selectedOutletId}
                  onChange={e => setSelectedOutletId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono"
                >
                  <option value="">-- General / No Outlet --</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.roCode})</option>
                  ))}
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
                  Register in R2
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
