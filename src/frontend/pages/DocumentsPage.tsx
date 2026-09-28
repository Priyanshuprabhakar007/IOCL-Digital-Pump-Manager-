import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Document, RetailOutlet } from '../../shared/types';
import { PERMISSIONS } from '../../shared/constants';
import { FolderGit2, Upload, FileText, AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

export const DocumentsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [outlets, setOutlets] = useState<RetailOutlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('File size exceeds the 5 MB limit.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setErrorMsg('Please select a file to upload.');
      return;
    }

    if (!selectedOutletId) {
      setErrorMsg('Please select an authorized retail outlet.');
      return;
    }

    setUploading(true);
    setUploadProgress(20);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('outletId', selectedOutletId);

    // Simulate progress ticks for feedback
    const progressTimer = setInterval(() => {
      setUploadProgress(prev => (prev < 80 ? prev + 15 : prev));
    }, 200);

    try {
      const res = await apiFetch<Document>('/api/v1/documents', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressTimer);
      setUploadProgress(100);

      if (res.success) {
        setSuccessMsg(`Document "${selectedFile.name}" uploaded successfully.`);
        setSelectedFile(null);
        setSelectedOutletId('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => {
          setModalOpen(false);
          setSuccessMsg(null);
          setUploadProgress(0);
          fetchDocs();
        }, 800);
      } else {
        setErrorMsg(res.error?.message || 'Failed to upload document.');
        setUploadProgress(0);
      }
    } catch (err: any) {
      clearInterval(progressTimer);
      setErrorMsg(err.message || 'An unexpected error occurred during upload.');
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-extrabold text-white">Document Vault (Cloudflare R2 Object Storage)</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Store & retrieve authentic outlet compliance documents, explosive licenses, and inspection records.
          </p>
        </div>

        {hasPermission(PERMISSIONS.DOCUMENTS_WRITE) && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setSuccessMsg(null);
              setSelectedFile(null);
              setSelectedOutletId('');
              setModalOpen(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center gap-2 self-start sm:self-auto cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
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
          <p className="text-sm font-semibold text-slate-300">No Vault Documents Uploaded</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Upload retail outlet license copies, explosive department approvals, or calibration certificates to Cloudflare R2.
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
                <h3 className="font-bold text-sm text-white truncate" title={doc.name}>{doc.name}</h3>
                <div className="text-[11px] text-slate-400 font-mono mt-1">
                  Outlet: <span className="text-slate-200">{doc.outletName || doc.outletId || 'General'}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between items-center">
                <span className="truncate max-w-[140px]" title={doc.r2Key}>R2: {doc.r2Key}</span>
                <span className="shrink-0">By: {doc.uploadedByName}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Document Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-orange-400" />
                <span>Upload Document</span>
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                disabled={uploading}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleUploadDocument} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Target Retail Outlet *</label>
                <select
                  required
                  value={selectedOutletId}
                  onChange={e => setSelectedOutletId(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:border-orange-500 focus:outline-none"
                >
                  <option value="">-- Select Retail Outlet --</option>
                  {outlets.map(o => (
                    <option key={o.id} value={o.id}>{o.name} ({o.roCode})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select File (PDF, PNG, JPEG &le; 5 MB) *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  required
                  accept=".pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white file:mr-3 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-orange-500 file:text-white hover:file:bg-orange-600 cursor-pointer"
                />
                {selectedFile && (
                  <div className="mt-2 text-[11px] text-slate-400 font-mono flex items-center justify-between">
                    <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                    <span>{(selectedFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                )}
              </div>

              {uploading && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Streaming to Cloudflare R2...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={uploading}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg font-semibold hover:bg-slate-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || !selectedOutletId}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-bold shadow-md flex items-center gap-2 cursor-pointer"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload Document</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPage;
