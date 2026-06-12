import type { ProcessingStatus } from '../../types/document';

const STATUS_LABELS: Record<ProcessingStatus, string> = {
  UPLOADED: '已上传',
  PARSING: '解析中',
  EMBEDDING: '向量化',
  READY: '已完成',
  FAILED: '失败',
  REPROCESS_REQUIRED: '需重新处理',
};

export function getStatusLabel(status: ProcessingStatus): string {
  return STATUS_LABELS[status];
}

export function getStatusClass(status: ProcessingStatus): string {
  return status.toLowerCase();
}

export function isTerminalStatus(status: ProcessingStatus): boolean {
  return status === 'READY' || status === 'FAILED' || status === 'REPROCESS_REQUIRED';
}
