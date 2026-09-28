import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, switchDemoUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await login(email, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Invalid credentials');
    }
  };

  const demoAccounts = [
    { title: 'System Admin', email: 'admin@iocl.in', scope: 'GLOBAL (All India)', desc: 'Full permissions across all modules and hierarchy' },
    { title: 'State Office', email: 'wbso@iocl.in', scope: 'STATE (West Bengal SO)', desc: 'State-wide user scope management & oversight' },
    { title: 'Divisional Office', email: 'kolkatado@iocl.in', scope: 'DIVISION (Kolkata DO)', desc: 'Divisional retail outlets & field operations' },
    { title: 'Field Officer', email: 'fo.central@iocl.in', scope: 'SALES_AREA (Kolkata Central SA)', desc: 'Sales area outlet inspections & compliance' },
    { title: 'Dealer', email: 'dealer.parkstreet@iocl.in', scope: 'OUTLET (Park Street RO-110023)', desc: 'Franchisee outlet master data & vault' },
    { title: 'CSP', email: 'csp.parkstreet@iocl.in', scope: 'OUTLET (Park Street RO-110023)', desc: 'Customer service provider operational staff' },
  ];

  const handleDemoClick = async (demoEmail: string) => {
    setError(null);
    setLoading(true);
    await switchDemoUser(demoEmail);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Column: IOCL Enterprise Branding & Form */}
        <div className="lg:col-span-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-orange-500/20">
              IOC
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">
                IOCL <span className="text-orange-500">Digital Pump Manager</span>
              </h1>
              <p className="text-xs text-slate-400 font-mono">
                Indian Oil Corporation Limited • Enterprise Gateway
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">Sign In to Enterprise Portal</h2>
              <p className="text-xs text-slate-400 mt-1">
                Enter your IOCL employee credentials or select a demo role.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Official Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="empcode@iocl.in"
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 text-center font-mono">
              Protected by SHA-256 Session Tokens & HttpOnly Cookies
            </div>
          </div>
        </div>

        {/* Right Column: 1-Click Demo Accounts Picker (Development Mode Only) */}
        {import.meta.env.DEV && (
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-orange-400 uppercase tracking-wider font-mono">
              <Sparkles className="w-4 h-4" />
              <span>1-Click Phase 1A Role Testing (Development Mode)</span>
            </div>

            <div className="space-y-2.5">
              {demoAccounts.map(demo => (
                <button
                  key={demo.email}
                  onClick={() => handleDemoClick(demo.email)}
                  disabled={loading}
                  className="w-full text-left p-3.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-orange-500/50 rounded-xl transition-all group flex items-start justify-between gap-3 shadow-md"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white group-hover:text-orange-400 transition-colors">
                        {demo.title}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                        {demo.scope}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      {demo.desc}
                    </p>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      {demo.email} • Password: <span className="text-slate-400">Password@123</span>
                    </div>
                  </div>

                  <div className="p-1.5 rounded-lg bg-slate-800 group-hover:bg-orange-500 text-slate-400 group-hover:text-white transition-colors shrink-0">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
