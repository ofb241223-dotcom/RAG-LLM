import { describe, expect, it, vi, afterEach } from 'vitest';
import { ApiError, apiRequest } from './client';
import { documentsApi } from './documents';

const uploadedDocument = {
  id: 11,
  originalFilename: 'report.pdf',
  format: 'PDF',
  status: 'READY',
  sizeBytes: 1024,
  uploadedAt: '2026-06-10T00:00:00Z',
  updatedAt: '2026-06-10T00:00:00Z',
};

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  upload: {
    onprogress: ((event: ProgressEvent) => void) | null;
  } = {
    onprogress: null,
  };

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 201;
  responseText = JSON.stringify(uploadedDocument);
  response: string | null = null;
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => {
    this.onabort?.();
  });

  constructor() {
    MockXMLHttpRequest.instances.push(this);
  }
}

describe('apiRequest', () => {
  afterEach(() => {
    MockXMLHttpRequest.instances = [];
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

  it('normalizes network failures into a readable ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(apiRequest('/settings')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: '后端服务不可用，请确认前后端服务已启动。',
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

  it('reports XHR upload progress while preserving the upload response', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const onUploadProgress = vi.fn();

    const uploadPromise = documentsApi.upload(new File(['pdf'], 'report.pdf'), { onUploadProgress });
    const xhr = MockXMLHttpRequest.instances[0];

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 } as ProgressEvent);
    xhr.onload?.();

    await expect(uploadPromise).resolves.toMatchObject(uploadedDocument);
    expect(onUploadProgress).toHaveBeenCalledWith(50);
    expect(xhr.send).toHaveBeenCalledTimes(1);
  });

  it('uses the backend JSON message when XHR upload is rejected', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);

    const uploadPromise = documentsApi.upload(new File(['pdf'], 'oversized.pdf'));
    const xhr = MockXMLHttpRequest.instances[0];
    xhr.status = 413;
    xhr.responseText = JSON.stringify({ message: 'Maximum upload size exceeded' });
    xhr.onload?.();

    await expect(uploadPromise).rejects.toMatchObject({
      name: 'ApiError',
      status: 413,
      message: 'Maximum upload size exceeded',
    });
  });

  it('aborts XHR upload when the abort signal is cancelled', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const controller = new AbortController();

    const uploadPromise = documentsApi.upload(new File(['pdf'], 'report.pdf'), { signal: controller.signal });
    const xhr = MockXMLHttpRequest.instances[0];

    controller.abort();

    await expect(uploadPromise).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: '上传已取消',
    });
    await expect(uploadPromise).rejects.toBeInstanceOf(ApiError);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
  });

  it('does not send XHR upload when the abort signal is already cancelled', async () => {
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest);
    const controller = new AbortController();
    controller.abort();

    const uploadPromise = documentsApi.upload(new File(['pdf'], 'report.pdf'), { signal: controller.signal });

    await expect(uploadPromise).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: '上传已取消',
    });
    expect(MockXMLHttpRequest.instances).toHaveLength(0);
  });
});
