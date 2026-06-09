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
    const fetchMock = vi.fn(async (_url: string) => ({
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

  it('serializes all document list filters into query parameters', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ items: [], page: 2, size: 15, total: 0 }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await documentsApi.list({
      page: 2,
      size: 15,
      format: 'PDF',
      status: 'READY',
      source: 'LOCAL_IMPORT',
      keyword: '向量 检索',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(requestUrl.pathname).toBe('/api/documents');
    expect(Object.fromEntries(requestUrl.searchParams.entries())).toEqual({
      page: '2',
      size: '15',
      format: 'PDF',
      status: 'READY',
      source: 'LOCAL_IMPORT',
      keyword: '向量 检索',
      startDate: '2026-06-01',
      endDate: '2026-06-10',
    });
  });

  it('fetches document stats and sends delete/reprocess requests with the documented methods', async () => {
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/documents/stats')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ totalDocuments: 10, readyDocuments: 8, successRate: 80, vectorCount: 128 }),
        };
      }

      return {
        ok: true,
        status: 204,
        headers: new Headers(),
        text: async () => '',
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(documentsApi.stats()).resolves.toEqual({
      totalDocuments: 10,
      readyDocuments: 8,
      successRate: 80,
      vectorCount: 128,
    });
    await documentsApi.delete(7);
    await documentsApi.batchDelete([3, 5]);
    await documentsApi.reprocess(9);

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/documents/stats', expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/documents/7', expect.objectContaining({ method: 'DELETE' }));
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/documents/batch-delete',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [3, 5] }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/documents/9/ingest', expect.objectContaining({ method: 'POST' }));
  });
});
