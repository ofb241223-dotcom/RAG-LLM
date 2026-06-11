import { Eye, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import type { DocumentDto } from '../../types/document';
import { formatBytes, formatDateTime } from '../../utils/format';
import { getStatusClass, getStatusLabel } from './status';

interface DocumentTableProps {
  documents: DocumentDto[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  variant?: 'compact' | 'management';
  selectedIds?: Set<number>;
  onToggleAll?: () => void;
  onToggleDocument?: (documentId: number) => void;
  onDelete?: (document: DocumentDto) => void;
  onOpenDetail?: (document: DocumentDto) => void;
  onReprocess?: (document: DocumentDto) => void;
}

function getFileTone(format: DocumentDto['format']): string {
  if (format === 'PDF') return 'pdf';
  if (format === 'TXT') return 'txt';
  if (format === 'XLSX' || format === 'XLS') return 'excel';
  return 'word';
}

function getSourceLabel(source: DocumentDto['source']): string {
  if (source === 'MANUAL_UPLOAD') return '手动上传';
  if (source === 'LOCAL_IMPORT') return '本地导入';
  if (source === 'API_IMPORT') return 'API导入';
  return '-';
}

export function DocumentTable({
  documents,
  loading = false,
  error,
  onRefresh,
  variant = 'compact',
  selectedIds,
  onToggleAll,
  onToggleDocument,
  onDelete,
  onOpenDetail,
  onReprocess,
}: DocumentTableProps) {
  if (loading) {
    return <div className="table-state">正在加载文档...</div>;
  }

  if (error && documents.length === 0) {
    return (
      <div className="table-state error-state" role="alert">
        <span>{error}</span>
        {onRefresh ? (
          <button className="secondary-button" type="button" onClick={onRefresh}>
            <RotateCcw size={15} />
            刷新
          </button>
        ) : null}
      </div>
    );
  }

  if (documents.length === 0) {
    return <div className="table-state empty-state">暂无文档，请先上传 PDF、TXT、Word 或 Excel。</div>;
  }

  if (variant === 'management') {
    const allSelected = documents.length > 0 && documents.every((document) => selectedIds?.has(document.id));

    return (
      <div className="document-table management">
        <div className="document-row management header">
          <span>
            <input
              aria-label="选择当前页文档"
              checked={allSelected}
              disabled={documents.length === 0}
              onChange={onToggleAll}
              type="checkbox"
            />
          </span>
          <span>文件名称</span>
          <span>类型</span>
          <span>来源</span>
          <span>大小</span>
          <span>上传时间</span>
          <span>状态</span>
          <span>分块</span>
          <span>向量</span>
          <span>操作</span>
        </div>
        {documents.map((document) => {
          const selected = Boolean(selectedIds?.has(document.id));

          return (
            <div className="document-row management" data-testid={`document-row-${document.id}`} key={document.id}>
              <span>
                <input
                  aria-label={`选择 ${document.originalFilename}`}
                  checked={selected}
                  onChange={() => onToggleDocument?.(document.id)}
                  type="checkbox"
                />
              </span>
              <span className="file-cell" title={document.originalFilename}>
                <i className={`file-badge ${getFileTone(document.format)}`}>{document.format}</i>
                {document.originalFilename}
              </span>
              <span>{document.format}</span>
              <span>{getSourceLabel(document.source)}</span>
              <span>{formatBytes(document.sizeBytes)}</span>
              <span>{formatDateTime(document.uploadedAt)}</span>
              <span>
                <mark className={`status-badge ${getStatusClass(document.status)}`}>{getStatusLabel(document.status)}</mark>
              </span>
              <span>{document.status === 'READY' ? document.chunkCount ?? '-' : '-'}</span>
              <span>{document.status === 'READY' ? document.vectorCount ?? '-' : '-'}</span>
              <span className="row-actions">
                <button aria-label={`查看处理详情 ${document.originalFilename}`} className="icon-button" onClick={() => onOpenDetail?.(document)} type="button">
                  <Eye size={15} />
                </button>
                <button aria-label={`重新处理 ${document.originalFilename}`} className="icon-button" onClick={() => onReprocess?.(document)} type="button">
                  <RefreshCw size={15} />
                </button>
                <button aria-label={`删除 ${document.originalFilename}`} className="icon-button danger" onClick={() => onDelete?.(document)} type="button">
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="document-table">
      <div className="document-row header">
        <span>文件名称</span>
        <span>类型</span>
        <span>大小</span>
        <span>更新时间</span>
        <span>状态</span>
        <span>分块</span>
      </div>
      {documents.map((document) => (
        <div className="document-row" data-testid={`document-row-${document.id}`} key={document.id}>
          <span className="file-cell" title={document.originalFilename}>
            <i className={`file-badge ${getFileTone(document.format)}`}>{document.format}</i>
            {document.originalFilename}
          </span>
          <span>{document.format}</span>
          <span>{formatBytes(document.sizeBytes)}</span>
          <span>{formatDateTime(document.updatedAt || document.uploadedAt)}</span>
          <span>
            <mark className={`status-badge ${getStatusClass(document.status)}`}>{getStatusLabel(document.status)}</mark>
          </span>
          <span>{document.status === 'READY' ? document.chunkCount ?? '-' : '-'}</span>
        </div>
      ))}
    </div>
  );
}
