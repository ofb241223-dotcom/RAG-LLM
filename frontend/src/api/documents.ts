import { ApiError, apiRequest, buildApiUrl } from './client';
import type { DocumentDto, DocumentListParams, DocumentListResponse } from '../types/document';

export interface UploadOptions {
  onUploadProgress?: (percent: number) => void;
}

export interface DocumentsApi {
  list(params?: DocumentListParams): Promise<DocumentListResponse>;
  upload(file: File, options?: UploadOptions): Promise<DocumentDto>;
  get(documentId: number): Promise<DocumentDto>;
  reprocess(documentId: number): Promise<DocumentDto>;
}

function buildQuery(params: DocumentListParams = {}): string {
  const query = new URLSearchParams();

  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.size !== undefined) query.set('size', String(params.size));
  if (params.status) query.set('status', params.status);
  if (params.keyword) query.set('keyword', params.keyword);

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

export const documentsApi: DocumentsApi = {
  async list(params) {
    const payload = await apiRequest<DocumentListResponse | DocumentDto[]>(`/documents${buildQuery(params)}`);
    return normalizeList(payload);
  },

  upload(file, options) {
    return new Promise<DocumentDto>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.open('POST', buildApiUrl('/documents'));

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !options?.onUploadProgress) {
          return;
        }

        options.onUploadProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(parseUploadResponse(xhr));
          } catch {
            reject(new ApiError('上传响应解析失败', xhr.status));
          }
          return;
        }

        reject(new ApiError(xhr.responseText || `上传失败 (${xhr.status})`, xhr.status));
      };

      xhr.onerror = () => reject(new ApiError('网络错误，上传失败', 0));
      xhr.ontimeout = () => reject(new ApiError('上传超时', 0));
      xhr.send(formData);
    });
  },

  get(documentId) {
    return apiRequest<DocumentDto>(`/documents/${documentId}`);
  },

  reprocess(documentId) {
    return apiRequest<DocumentDto>(`/documents/${documentId}/ingest`, {
      method: 'POST',
    });
  },
};
