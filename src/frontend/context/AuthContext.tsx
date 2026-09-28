import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserContext, RoleCode, PermissionCode } from '../../shared/types';
import { apiFetch } from '../services/api';

interface AuthContextType {
  userCtx: UserContext | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refetchMe: () => Promise<void>;
  hasPermission: (perm: PermissionCode) => boolean;
  hasRole: (role: RoleCode) => boolean;
  switchDemoUser: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userCtx, setUserCtx] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchMe = async () => {
    setLoading(true);
    const res = await apiFetch<UserContext>('/api/v1/auth/me');
    if (res.success && res.data) {
      setUserCtx(res.data);
    } else {
      setUserCtx(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchMe();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<any>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (res.success) {
      await fetchMe();
      return { success: true };
    } else {
      return {
        success: false,
        error: res.error?.message || 'Login failed. Check credentials.',
      };
    }
  };

  const switchDemoUser = async (email: string) => {
    return login(email, 'Password@123');
  };

  const logout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    setUserCtx(null);
  };

  const hasPermission = (perm: PermissionCode): boolean => {
    if (!userCtx) return false;
    return userCtx.isGlobalAdmin || userCtx.permissions.includes(perm);
  };

  const hasRole = (role: RoleCode): boolean => {
    if (!userCtx) return false;
    return userCtx.isGlobalAdmin || userCtx.roles.includes(role);
  };

  return (
    <AuthContext.Provider
      value={{
        userCtx,
        loading,
        login,
        logout,
        refetchMe: fetchMe,
        hasPermission,
        hasRole,
        switchDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
