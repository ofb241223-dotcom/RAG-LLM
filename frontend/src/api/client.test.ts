import { describe, expect, it, vi, afterEach } from 'vitest';
import { ApiError, apiRequest } from './client';
import { documentsApi } from './documents';

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('throws an ApiError with status and server message for HTTP failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ message: 'RAG service unavailable' }),
      })),
    );

    await expect(apiRequest('/documents')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'RAG service unavailable',
    });
  });

  it('uses /api as the default base URL', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ items: [] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/documents');

    expect(fetchMock).toHaveBeenCalledWith('/api/documents', expect.any(Object));
  });

  it('allows the API base URL to be configured for local backend integration', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:8081/api');
    const { buildApiUrl } = await import('./client');

    expect(buildApiUrl('/documents')).toBe('http://127.0.0.1:8081/api/documents');
  });

  it('rejects malformed document list responses before the UI consumes them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      })),
    );

    await expect(documentsApi.list()).rejects.toMatchObject({
      name: 'ApiError',
      message: '文档列表响应格式错误',
    });
  });
});
