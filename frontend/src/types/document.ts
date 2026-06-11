export type ProcessingStatus = 'UPLOADED' | 'PARSING' | 'EMBEDDING' | 'READY' | 'FAILED' | 'REPROCESS_REQUIRED';

export type DocumentFormat = 'PDF' | 'TXT' | 'DOCX' | 'DOC';

export type DocumentSource = 'MANUAL_UPLOAD' | 'LOCAL_IMPORT' | 'API_IMPORT';

export interface DocumentDto {
  id: number;
  originalFilename: string;
  format: DocumentFormat;
  source?: DocumentSource;
  status: ProcessingStatus;
  sizeBytes: number;
  uploadedAt: string;
  updatedAt: string;
  chunkCount?: number | null;
  vectorCount?: number | null;
  errorMessage?: string | null;
}

export interface DocumentListResponse {
  items: DocumentDto[];
  page: number;
  size: number;
  total: number;
}

export interface DocumentListParams {
  page?: number;
  size?: number;
  format?: DocumentFormat;
  status?: ProcessingStatus;
  source?: DocumentSource;
  keyword?: string;
  startDate?: string;
  endDate?: string;
}

export interface DocumentStats {
  totalDocuments: number;
  readyDocuments: number;
  successRate: number;
  vectorCount: number;
}

export interface DocumentBatchResult {
  deletedCount: number;
  failures: Array<{
    id: number | null;
    message: string;
  }>;
}

export interface DocumentChunkDto {
  document_id?: string;
  documentId?: string;
  chunk_id?: string;
  chunkId?: string;
  source_name?: string;
  sourceName?: string;
  format: DocumentFormat | string;
  chunk_index?: number;
  chunkIndex?: number;
  text: string;
  page?: number | null;
}
