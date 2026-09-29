import { ApiResponse } from '../../shared/types';

let authToken: string | null = null;
if (typeof window !== 'undefined') {
  try {
    authToken = sessionStorage.getItem('iocl_auth_token');
  } catch {}
}

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem('iocl_auth_token', token);
      } else {
        sessionStorage.removeItem('iocl_auth_token');
      }
    } catch {}
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const defaultHeaders: Record<string, string> = isFormData
    ? {}
    : { 'Content-Type': 'application/json' };

  if (authToken) {
    defaultHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const config: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string> || {}),
    },
  };

  try {
    const res = await fetch(endpoint, config);
    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (err: any) {
    return {
      success: false,
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: err.message || 'Failed to connect to backend server',
      },
    };
  }
}
