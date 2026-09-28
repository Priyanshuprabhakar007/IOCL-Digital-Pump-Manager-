import { ApiResponse } from '../../shared/types';

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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
