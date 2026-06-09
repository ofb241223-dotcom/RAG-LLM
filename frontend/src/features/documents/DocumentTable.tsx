import { RotateCcw } from 'lucide-react';
import type { DocumentDto } from '../../types/document';
import { formatBytes, formatDateTime } from '../../utils/format';
import { getStatusClass, getStatusLabel } from './status';

interface DocumentTableProps {
  documents: DocumentDto[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
}

function getFileTone(format: DocumentDto['format']): string {
  if (format === 'PDF') return 'pdf';
  if (format === 'TXT') return 'txt';
  return 'word';
}

export function DocumentTable({ documents, loading = false, error, onRefresh }: DocumentTableProps) {
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
    return <div className="table-state">暂无文档，请先上传 PDF、TXT 或 Word。</div>;
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
            {document.errorMessage ? <small className="row-error">{document.errorMessage}</small> : null}
          </span>
          <span>{document.chunkCount ?? '-'}</span>
        </div>
      ))}
    </div>
  );
}
