import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentsPage } from './DocumentsPage';
import type { DocumentDto } from '../../types/document';

const documents: DocumentDto[] = [
  {
    id: 1,
    originalFilename: 'ready.pdf',
    format: 'PDF',
    source: 'MANUAL_UPLOAD',
    status: 'READY',
    sizeBytes: 1024,
    uploadedAt: '2026-06-09T12:00:00Z',
    updatedAt: '2026-06-09T12:01:00Z',
    chunkCount: 6,
    vectorCount: 6,
  },
  {
    id: 2,
    originalFilename: 'imported.docx',
    format: 'DOCX',
    source: 'LOCAL_IMPORT',
    status: 'FAILED',
    sizeBytes: 4096,
    uploadedAt: '2026-06-08T10:00:00Z',
    updatedAt: '2026-06-08T10:01:00Z',
    chunkCount: 0,
    vectorCount: 0,
    errorMessage: 'parse failed',
  },
];

let nativeConfirm: ReturnType<typeof vi.fn>;

function createDocumentsApi() {
  return {
    list: vi.fn(async (params = {}) => ({
      items: documents,
      page: params.page ?? 0,
      size: params.size ?? 10,
      total: 21,
    })),
    stats: vi.fn(async () => ({
      totalDocuments: 21,
      readyDocuments: 16,
      successRate: 76.2,
      vectorCount: 352,
    })),
    delete: vi.fn(async () => undefined),
    batchDelete: vi.fn(async () => ({ deletedCount: 1, failures: [] })),
    reprocess: vi.fn(async () => documents[0]),
  };
}

describe('DocumentsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ items: [], page: 0, size: 10, total: 0 }),
      })),
    );
    nativeConfirm = vi.fn(() => {
      throw new Error('native confirm should not be called');
    });
    vi.stubGlobal('confirm', nativeConfirm);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads stats, sends filter query params, resets filters, and paginates', async () => {
    const api = createDocumentsApi();
    render(<DocumentsPage documentsApi={api} />);

    await waitFor(() => expect(api.stats).toHaveBeenCalledTimes(1));
    expect(api.list).toHaveBeenLastCalledWith({ page: 0, size: 10 });
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('76.2%')).toBeInTheDocument();
    expect(screen.getByText('352')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('文件类型'), { target: { value: 'PDF' } });
    expect(screen.getByRole('option', { name: 'XLSX' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'XLS' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('解析状态'), { target: { value: 'READY' } });
    expect(screen.getByRole('option', { name: '需重新处理' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '本地导入' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'API导入' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'MANUAL_UPLOAD' } });
    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('结束日期'), { target: { value: '2026-06-10' } });
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: '向量 检索' } });

    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith({
        page: 0,
        size: 10,
        format: 'PDF',
        status: 'READY',
        source: 'MANUAL_UPLOAD',
        startDate: '2026-06-01',
        endDate: '2026-06-10',
        keyword: '向量 检索',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 0, size: 10 }));
    expect(screen.getByLabelText('文件类型')).toHaveValue('');
    expect(screen.getByLabelText('关键词')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('每页条数'), { target: { value: '20' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 0, size: 20 }));

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith({ page: 1, size: 20 }));
  });

  it('enables selected-row batch actions and reloads after delete or reprocess commands', async () => {
    const api = createDocumentsApi();
    render(<DocumentsPage documentsApi={api} />);

    const row = await screen.findByTestId('document-row-1');
    expect(screen.getByRole('button', { name: '批量删除' })).toBeDisabled();

    fireEvent.click(within(row).getByRole('checkbox', { name: '选择 ready.pdf' }));
    expect(screen.getByText('已选择 1 项')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批量删除' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: '批量删除' }));
    const batchDialog = screen.getByRole('dialog', { name: '删除确认' });
    expect(within(batchDialog).getByText('确认删除选中的 1 个文档吗？')).toBeInTheDocument();
    expect(api.batchDelete).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click(within(batchDialog).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(api.batchDelete).toHaveBeenCalledWith([1]));
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click(within(row).getByRole('button', { name: '重新处理 ready.pdf' }));
    await waitFor(() => expect(api.reprocess).toHaveBeenCalledWith(1));

    fireEvent.click(within(row).getByRole('button', { name: '删除 ready.pdf' }));
    const singleDialog = screen.getByRole('dialog', { name: '删除确认' });
    expect(within(singleDialog).getByText('确认删除文档 ready.pdf 吗？')).toBeInTheDocument();

    fireEvent.click(within(singleDialog).getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(1));
    expect(nativeConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '刷新文档列表' }));
    await waitFor(() => expect(api.stats).toHaveBeenCalledTimes(5));
  });
});
