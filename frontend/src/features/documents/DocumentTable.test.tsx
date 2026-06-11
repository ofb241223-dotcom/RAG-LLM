import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentTable } from './DocumentTable';
import type { DocumentDto } from '../../types/document';

const documents: DocumentDto[] = [
  {
    id: 1,
    originalFilename: 'ready.pdf',
    format: 'PDF',
    status: 'READY',
    sizeBytes: 1024,
    uploadedAt: '2026-06-09T12:00:00Z',
    updatedAt: '2026-06-09T12:01:00Z',
    chunkCount: 6,
    vectorCount: 6,
  },
  {
    id: 2,
    originalFilename: 'parsing.docx',
    format: 'DOCX',
    status: 'PARSING',
    sizeBytes: 2048,
    uploadedAt: '2026-06-09T12:02:00Z',
    updatedAt: '2026-06-09T12:03:00Z',
  },
  {
    id: 3,
    originalFilename: 'failed.txt',
    format: 'TXT',
    status: 'FAILED',
    sizeBytes: 512,
    uploadedAt: '2026-06-09T12:04:00Z',
    updatedAt: '2026-06-09T12:05:00Z',
    errorMessage: 'empty document',
  },
];

describe('DocumentTable', () => {
  it('renders loading, empty, error, and status badges for document rows', () => {
    const { rerender } = render(<DocumentTable documents={[]} loading />);
    expect(screen.getByText('正在加载文档...')).toBeInTheDocument();

    rerender(<DocumentTable documents={[]} />);
    expect(screen.getByText('暂无文档，请先上传 PDF、TXT、Word 或 Excel。')).toBeInTheDocument();

    rerender(<DocumentTable documents={[]} error="请求失败" onRefresh={() => undefined} />);
    expect(screen.getByText('请求失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();

    rerender(<DocumentTable documents={documents} />);

    const readyRow = screen.getByTestId('document-row-1');
    expect(within(readyRow).getByText('ready.pdf')).toBeInTheDocument();
    expect(within(readyRow).getByText('已完成')).toHaveClass('status-badge', 'ready');
    expect(within(readyRow).getByText('6')).toBeInTheDocument();

    const parsingRow = screen.getByTestId('document-row-2');
    expect(within(parsingRow).getByText('解析中')).toHaveClass('status-badge', 'parsing');

    const failedRow = screen.getByTestId('document-row-3');
    expect(within(failedRow).getByText('失败')).toHaveClass('status-badge', 'failed');
    expect(within(failedRow).queryByText('empty document')).not.toBeInTheDocument();
  });

  it('opens document detail from the management row without toggling selection', () => {
    const onOpenDetail = vi.fn();
    const onToggleDocument = vi.fn();

    render(
      <DocumentTable
        documents={documents}
        onOpenDetail={onOpenDetail}
        onToggleDocument={onToggleDocument}
        selectedIds={new Set()}
        variant="management"
      />,
    );

    const readyRow = screen.getByTestId('document-row-1');
    within(readyRow).getByRole('button', { name: '查看处理详情 ready.pdf' }).click();

    expect(onOpenDetail).toHaveBeenCalledWith(documents[0]);
    expect(onToggleDocument).not.toHaveBeenCalled();
    expect(within(readyRow).queryByRole('button', { name: '更多 ready.pdf' })).not.toBeInTheDocument();
  });
});
