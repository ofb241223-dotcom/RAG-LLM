export const DEFAULT_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function buildApiUrl(path: string, baseUrl = DEFAULT_API_BASE_URL): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}

async function readResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  return fallback;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      headers: options.headers ?? {},
    });
  } catch (error) {
    throw new ApiError('后端服务不可用，请确认前后端服务已启动。', 0, error);
  }
  const payload = await readResponse(response);

  if (!response.ok) {
    throw new ApiError(getErrorMessage(payload, `请求失败 (${response.status})`), response.status, payload);
  }

  return payload as T;
}
