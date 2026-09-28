import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { AuditLog } from '../../shared/types';
import { Activity, Clock, ShieldAlert, Code } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    const res = await apiFetch<AuditLog[]>('/api/v1/audit-logs');
    if (res.data) setLogs(res.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-6 h-6 text-purple-400" />
          <h1 className="text-xl font-extrabold text-white">System Audit Trail</h1>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Immutable system log capturing all mutations, user activities, IP addresses, and state changes.
        </p>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400 font-mono animate-pulse">
          Loading audit records...
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/80 text-slate-400 font-mono uppercase text-[10px] tracking-wider border-b border-slate-700/80">
                <tr>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Entity Type</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200 font-mono">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 text-slate-400 text-[11px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>

                    <td className="p-4 font-bold text-orange-400">
                      {log.action}
                    </td>

                    <td className="p-4 text-white font-sans font-semibold">
                      {log.userName}
                    </td>

                    <td className="p-4 text-slate-300">
                      {log.entityType} ({log.entityId.slice(0, 8)}...)
                    </td>

                    <td className="p-4 text-slate-400">
                      {log.ipAddress || '127.0.0.1'}
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 text-[11px] font-sans"
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inspect Drawer/Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <h2 className="text-lg font-bold text-white">Audit Payload Details</h2>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                <div className="text-slate-400 text-[10px]">NEW VALUE STATE JSON:</div>
                <pre className="text-emerald-400 text-[11px] overflow-x-auto mt-1 p-2 bg-slate-950 rounded">
                  {selectedLog.newValueJson ? JSON.stringify(JSON.parse(selectedLog.newValueJson), null, 2) : 'None'}
                </pre>
              </div>

              {selectedLog.oldValueJson && (
                <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
                  <div className="text-slate-400 text-[10px]">OLD VALUE STATE JSON:</div>
                  <pre className="text-red-400 text-[11px] overflow-x-auto mt-1 p-2 bg-slate-950 rounded">
                    {JSON.stringify(JSON.parse(selectedLog.oldValueJson), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
