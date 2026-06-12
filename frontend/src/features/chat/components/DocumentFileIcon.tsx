import { FileSpreadsheet, FileText } from 'lucide-react';
import type { DocumentFormat } from '../../../types/document';

interface DocumentFileIconProps {
  format?: DocumentFormat;
  className?: string;
  testId?: string;
}

export function DocumentFileIcon({ format, className = '', testId }: DocumentFileIconProps) {
  const tone = format ? format.toLowerCase() : 'generic';
  const label = format ? `${format} 文件` : '文件';
  const Icon = format === 'XLSX' || format === 'XLS' ? FileSpreadsheet : FileText;

  return (
    <span aria-label={label} className={`document-file-icon ${tone} ${className}`.trim()} data-testid={testId}>
      <Icon size={20} aria-hidden="true" />
    </span>
  );
}
