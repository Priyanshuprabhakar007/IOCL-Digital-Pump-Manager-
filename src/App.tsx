import React, { useState } from 'react';
import { AuthProvider, useAuth } from './frontend/context/AuthContext';
import { LoginPage } from './frontend/pages/LoginPage';
import { DashboardShell } from './frontend/components/layout/DashboardShell';
import { DashboardPage } from './frontend/pages/DashboardPage';
import { OutletsPage } from './frontend/pages/OutletsPage';
import { UsersPage } from './frontend/pages/UsersPage';
import { ScopesPage } from './frontend/pages/ScopesPage';
import { HierarchyPage } from './frontend/pages/HierarchyPage';
import { RbacPage } from './frontend/pages/RbacPage';
import { AuditPage } from './frontend/pages/AuditPage';
import { DocumentsPage } from './frontend/pages/DocumentsPage';

function MainAppContent() {
  const { userCtx, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-xl shadow-orange-500/20 animate-pulse mb-4">
          IOC
        </div>
        <div className="text-sm font-bold text-white tracking-wide">
          IOCL <span className="text-orange-500">Digital Pump Manager</span>
        </div>
        <div className="text-xs text-slate-400 font-mono mt-1">
          Authenticating Worker Session...
        </div>
      </div>
    );
  }

  if (!userCtx) {
    return <LoginPage />;
  }

  return (
    <DashboardShell activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <DashboardPage />}
      {activeTab === 'outlets' && <OutletsPage />}
      {activeTab === 'users' && <UsersPage />}
      {activeTab === 'scopes' && <ScopesPage />}
      {activeTab === 'hierarchy' && <HierarchyPage />}
      {activeTab === 'rbac' && <RbacPage />}
      {activeTab === 'audit' && <AuditPage />}
      {activeTab === 'documents' && <DocumentsPage />}
    </DashboardShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
