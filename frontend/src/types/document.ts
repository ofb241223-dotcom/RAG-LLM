export type ProcessingStatus = 'UPLOADED' | 'PARSING' | 'EMBEDDING' | 'READY' | 'FAILED';

export type DocumentFormat = 'PDF' | 'TXT' | 'DOCX' | 'DOC';

export interface DocumentDto {
  id: number;
  originalFilename: string;
  format: DocumentFormat;
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
  status?: ProcessingStatus;
  keyword?: string;
}
