import { ApiError, apiRequest, buildApiUrl } from './client';
import type {
  DocumentActivityDto,
  DocumentBatchResult,
  DocumentChunkDto,
  DocumentDto,
  DocumentListParams,
  DocumentListResponse,
  DocumentProcessingStepDto,
  DocumentStats,
} from '../types/document';

export interface UploadOptions {
  onUploadProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export interface DocumentsApi {
  list(params?: DocumentListParams): Promise<DocumentListResponse>;
  stats(): Promise<DocumentStats>;
  upload(file: File, options?: UploadOptions): Promise<DocumentDto>;
  get(documentId: number): Promise<DocumentDto>;
  chunks(documentId: number): Promise<DocumentChunkDto[]>;
  processing(documentId: number): Promise<DocumentProcessingStepDto[]>;
  activities(limit?: number): Promise<DocumentActivityDto[]>;
  downloadUrl(documentId: number): string;
  reprocess(documentId: number): Promise<DocumentDto>;
  delete(documentId: number): Promise<void>;
  batchDelete(ids: number[]): Promise<DocumentBatchResult>;
}

function buildQuery(params: DocumentListParams = {}): string {
  const query = new URLSearchParams();

  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.size !== undefined) query.set('size', String(params.size));
  if (params.format) query.set('format', params.format);
  if (params.status) query.set('status', params.status);
  if (params.source) query.set('source', params.source);
  if (params.keyword) query.set('keyword', params.keyword);
  if (params.startDate) query.set('startDate', params.startDate);
  if (params.endDate) query.set('endDate', params.endDate);

  const value = query.toString();
  return value ? `?${value}` : '';
}

function normalizeList(payload: DocumentListResponse | DocumentDto[]): DocumentListResponse {
  if (Array.isArray(payload)) {
    return {
      items: payload,
      page: 0,
      size: payload.length,
      total: payload.length,
    };
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as DocumentListResponse).items)) {
    return payload;
  }

  throw new ApiError('文档列表响应格式错误', 0, payload);
}

function parseUploadResponse(xhr: XMLHttpRequest): DocumentDto {
  const text = xhr.responseText || String(xhr.response ?? '');
  return JSON.parse(text) as DocumentDto;
}

function parseUploadError(xhr: XMLHttpRequest): string {
  const text = xhr.responseText || String(xhr.response ?? '');
  if (!text) {
    return `上传失败 (${xhr.status})`;
  }

  try {
    const payload = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  } catch {
    return text;
  }

  return text;
}

export const documentsApi: DocumentsApi = {
  async list(params) {
    const payload = await apiRequest<DocumentListResponse | DocumentDto[]>(`/documents${buildQuery(params)}`);
    return normalizeList(payload);
  },

  stats() {
    return apiRequest<DocumentStats>('/documents/stats');
  },

  upload(file, options) {
    if (options?.signal?.aborted) {
      return Promise.reject(new ApiError('上传已取消', 0));
    }

    return new Promise<DocumentDto>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      const abortUpload = () => xhr.abort();
      const cleanupAbortListener = () => {
        options?.signal?.removeEventListener('abort', abortUpload);
      };

      xhr.open('POST', buildApiUrl('/documents'));

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !options?.onUploadProgress) {
          return;
        }

        options.onUploadProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        cleanupAbortListener();

        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(parseUploadResponse(xhr));
          } catch {
            reject(new ApiError('上传响应解析失败', xhr.status));
          }
          return;
        }

        reject(new ApiError(parseUploadError(xhr), xhr.status));
      };

      xhr.onerror = () => {
        cleanupAbortListener();
        reject(new ApiError('上传请求未到达后端，请确认后端服务正在运行或文件大小未超过限制', 0));
      };
      xhr.ontimeout = () => {
        cleanupAbortListener();
        reject(new ApiError('上传超时', 0));
      };
      xhr.onabort = () => {
        cleanupAbortListener();
        reject(new ApiError('上传已取消', 0));
      };

      options?.signal?.addEventListener('abort', abortUpload, { once: true });
      xhr.send(formData);
    });
  },

  get(documentId) {
    return apiRequest<DocumentDto>(`/documents/${documentId}`);
  },

  chunks(documentId) {
    return apiRequest<DocumentChunkDto[]>(`/documents/${documentId}/chunks`);
  },

  processing(documentId) {
    return apiRequest<DocumentProcessingStepDto[]>(`/documents/${documentId}/processing`);
  },

  activities(limit = 50) {
    return apiRequest<DocumentActivityDto[]>(`/documents/activity?limit=${limit}`);
  },

  downloadUrl(documentId) {
    return buildApiUrl(`/documents/${documentId}/download`);
  },

  reprocess(documentId) {
    return apiRequest<DocumentDto>(`/documents/${documentId}/ingest`, {
      method: 'POST',
    });
  },

  delete(documentId) {
    return apiRequest<void>(`/documents/${documentId}`, {
      method: 'DELETE',
    });
  },

  batchDelete(ids) {
    return apiRequest<DocumentBatchResult>('/documents/batch-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  },
};
