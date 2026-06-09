import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Database, FileText, MoreHorizontal, RefreshCw, Settings2, Trash2, UploadCloud } from 'lucide-react';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import type { DocumentDto, DocumentFormat, DocumentListParams, DocumentSource, DocumentStats, ProcessingStatus } from '../../types/document';
import { DocumentTable } from './DocumentTable';

type DocumentsPageApi = Pick<DocumentsApi, 'list' | 'stats' | 'delete' | 'batchDelete' | 'reprocess'>;

interface DocumentsPageProps {
  documentsApi?: DocumentsPageApi;
  onNavigate?: (view: 'documents' | 'upload' | 'chat') => void;
}

type FilterState = {
  format: DocumentFormat | '';
  status: ProcessingStatus | '';
  source: DocumentSource | '';
  keyword: string;
  startDate: string;
  endDate: string;
};

type ConfirmDialogState =
  | {
      kind: 'single';
      document: DocumentDto;
      message: string;
    }
  | {
      kind: 'batch';
      ids: number[];
      message: string;
    };

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const EMPTY_FILTERS: FilterState = {
  format: '',
  status: '',
  source: '',
  keyword: '',
  startDate: '',
  endDate: '',
};
const EMPTY_STATS: DocumentStats = {
  totalDocuments: 0,
  readyDocuments: 0,
  successRate: 0,
  vectorCount: 0,
};

function buildListParams(filters: FilterState, page: number, size: number): DocumentListParams {
  const params: DocumentListParams = { page, size };
  const keyword = filters.keyword.trim();

  if (filters.format) params.format = filters.format;
  if (filters.status) params.status = filters.status;
  if (filters.source) params.source = filters.source;
  if (filters.startDate) params.startDate = filters.startDate;
  if (filters.endDate) params.endDate = filters.endDate;
  if (keyword) params.keyword = keyword;

  return params;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatSuccessRate(value: number): string {
  const percent = value > 0 && value <= 1 ? value * 100 : value;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(1)}%`;
}

export function DocumentsPage({ documentsApi = defaultDocumentsApi, onNavigate }: DocumentsPageProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [stats, setStats] = useState<DocumentStats>(EMPTY_STATS);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const hasLoadedRef = useRef(false);

  const queryParams = useMemo(() => buildListParams(filters, page, pageSize), [filters, page, pageSize]);
  const selectedCount = selectedIds.size;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadDocuments = useCallback(async () => {
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setLoading(true);
    setRefreshing(true);
    setError(undefined);

    try {
      const [listResult, nextStats] = await Promise.all([documentsApi.list(queryParams), documentsApi.stats()]);
      const visibleIds = new Set(listResult.items.map((document) => document.id));

      setDocuments(listResult.items);
      setTotal(listResult.total);
      setStats(nextStats);
      setSelectedIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
    } catch (err) {
      setError(getErrorMessage(err, '文档列表加载失败'));
      if (isInitialLoad) setDocuments([]);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [documentsApi, queryParams]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const updateFilter = useCallback(<Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => {
    setPage(0);
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setPage(0);
    setFilters({ ...EMPTY_FILTERS });
  }, []);

  const runDocumentAction = useCallback(
    async (action: () => Promise<void>, fallback: string) => {
      setActionError(undefined);
      setRefreshing(true);
      try {
        await action();
        await loadDocuments();
      } catch (err) {
        setActionError(getErrorMessage(err, fallback));
        setRefreshing(false);
      }
    },
    [loadDocuments],
  );

  const toggleDocument = useCallback((documentId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }, []);

  const toggleCurrentPage = useCallback(() => {
    const pageIds = documents.map((document) => document.id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(pageIds));
  }, [documents, selectedIds]);

  const deleteDocument = useCallback(
    (document: DocumentDto) => {
      setConfirmDialog({
        kind: 'single',
        document,
        message: `确认删除文档 ${document.originalFilename} 吗？`,
      });
    },
    [],
  );

  const batchDelete = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setConfirmDialog({
      kind: 'batch',
      ids,
      message: `确认删除选中的 ${ids.length} 个文档吗？`,
    });
  }, [selectedIds]);

  const closeConfirmDialog = useCallback(() => {
    setConfirmDialog(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (!confirmDialog) return;

    if (confirmDialog.kind === 'single') {
      const { document } = confirmDialog;
      setConfirmDialog(null);
      void runDocumentAction(async () => {
        await documentsApi.delete(document.id);
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(document.id);
          return next;
        });
      }, '文档删除失败');
      return;
    }

    const { ids } = confirmDialog;
    setConfirmDialog(null);
    void runDocumentAction(async () => {
      await documentsApi.batchDelete(ids);
      setSelectedIds(new Set());
    }, '批量删除失败');
  }, [confirmDialog, documentsApi, runDocumentAction]);

  const reprocessDocument = useCallback(
    (document: DocumentDto) => {
      void runDocumentAction(async () => {
        await documentsApi.reprocess(document.id);
      }, '重新处理失败');
    },
    [documentsApi, runDocumentAction],
  );

  const batchReprocess = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    void runDocumentAction(async () => {
      await Promise.all(ids.map((id) => documentsApi.reprocess(id)));
    }, '批量重新处理失败');
  }, [documentsApi, runDocumentAction, selectedIds]);

  return (
    <section className="feature-page documents-page">
      <div className="documents-hero">
        <div className="page-heading document-heading">
          <div>
            <h1>文档中心</h1>
            <p>集中管理知识库文档，按解析状态、导入来源和时间范围快速定位问题文档。</p>
          </div>
        </div>

        <div className="document-stat-strip" aria-label="文档统计">
          <article className="document-stat-card">
            <span className="document-stat-icon blue">
              <FileText size={20} />
            </span>
            <div>
              <small>文档总数</small>
              <strong>{stats.totalDocuments.toLocaleString('zh-CN')}</strong>
            </div>
          </article>
          <article className="document-stat-card">
            <span className="document-stat-icon green">
              <CheckCircle2 size={20} />
            </span>
            <div>
              <small>解析成功率</small>
              <strong>{formatSuccessRate(stats.successRate)}</strong>
              <em>{stats.readyDocuments.toLocaleString('zh-CN')} 份可用</em>
            </div>
          </article>
          <article className="document-stat-card">
            <span className="document-stat-icon orange">
              <Database size={20} />
            </span>
            <div>
              <small>向量总数</small>
              <strong>{stats.vectorCount.toLocaleString('zh-CN')}</strong>
            </div>
          </article>
        </div>
      </div>

      <form className="panel document-filter-panel" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>文件类型</span>
          <select value={filters.format} onChange={(event) => updateFilter('format', event.target.value as FilterState['format'])}>
            <option value="">全部类型</option>
            <option value="PDF">PDF</option>
            <option value="TXT">TXT</option>
            <option value="DOCX">DOCX</option>
            <option value="DOC">DOC</option>
          </select>
        </label>
        <label>
          <span>解析状态</span>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value as FilterState['status'])}>
            <option value="">全部状态</option>
            <option value="UPLOADED">已上传</option>
            <option value="PARSING">解析中</option>
            <option value="EMBEDDING">向量化</option>
            <option value="READY">已完成</option>
            <option value="FAILED">失败</option>
          </select>
        </label>
        <label>
          <span>来源</span>
          <select value={filters.source} onChange={(event) => updateFilter('source', event.target.value as FilterState['source'])}>
            <option value="">全部来源</option>
            <option value="MANUAL_UPLOAD">手动上传</option>
            <option value="LOCAL_IMPORT">本地导入</option>
            <option value="API_IMPORT">API导入</option>
          </select>
        </label>
        <label>
          <span>开始日期</span>
          <input type="date" value={filters.startDate} onChange={(event) => updateFilter('startDate', event.target.value)} />
        </label>
        <label>
          <span>结束日期</span>
          <input type="date" value={filters.endDate} onChange={(event) => updateFilter('endDate', event.target.value)} />
        </label>
        <label className="keyword-filter">
          <span>关键词</span>
          <input placeholder="文件名或内容关键词" type="search" value={filters.keyword} onChange={(event) => updateFilter('keyword', event.target.value)} />
        </label>
        <button className="secondary-button" type="button" onClick={resetFilters}>
          重置
        </button>
      </form>

      <div className="panel document-toolbar">
        <strong>已选择 {selectedCount} 项</strong>
        <div className="toolbar-actions">
          <button className="primary-button" type="button" onClick={() => onNavigate?.('upload')}>
            <UploadCloud size={16} />
            上传文档
          </button>
          <button className="secondary-button" disabled={selectedCount === 0 || refreshing} type="button" onClick={batchDelete}>
            <Trash2 size={16} />
            批量删除
          </button>
          <button className="secondary-button" disabled={selectedCount === 0 || refreshing} type="button" onClick={batchReprocess}>
            <RefreshCw size={16} />
            重新处理
          </button>
          <button aria-label="更多操作" className="icon-button toolbar-icon" type="button">
            <MoreHorizontal size={17} />
          </button>
          <button aria-label="刷新文档列表" className="icon-button toolbar-icon" disabled={refreshing} type="button" onClick={() => void loadDocuments()}>
            <RefreshCw size={17} />
          </button>
          <button aria-label="列表设置" className="icon-button toolbar-icon" type="button">
            <Settings2 size={17} />
          </button>
        </div>
      </div>

      {actionError ? (
        <p className="inline-error document-action-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <article className="panel page-panel document-table-panel">
        <DocumentTable
          documents={documents}
          error={error}
          loading={loading}
          onDelete={deleteDocument}
          onRefresh={loadDocuments}
          onReprocess={reprocessDocument}
          onToggleAll={toggleCurrentPage}
          onToggleDocument={toggleDocument}
          selectedIds={selectedIds}
          variant="management"
        />
      </article>

      <div className="document-pagination">
        <span>
          共 {total.toLocaleString('zh-CN')} 条，第 {Math.min(page + 1, totalPages)} / {totalPages} 页
        </span>
        <label>
          <span>每页条数</span>
          <select value={pageSize} onChange={(event) => {
            setPage(0);
            setPageSize(Number(event.target.value));
          }}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <button className="secondary-button" disabled={page === 0 || refreshing} type="button" onClick={() => setPage((current) => Math.max(0, current - 1))}>
          上一页
        </button>
        <button className="secondary-button" disabled={page + 1 >= totalPages || refreshing} type="button" onClick={() => setPage((current) => current + 1)}>
          下一页
        </button>
      </div>

      {confirmDialog ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="document-confirm-title" aria-modal="true" className="confirm-dialog" role="dialog">
            <div className="confirm-dialog-icon">
              <Trash2 size={22} />
            </div>
            <div className="confirm-dialog-content">
              <h2 id="document-confirm-title">删除确认</h2>
              <p>{confirmDialog.message}</p>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={closeConfirmDialog}>
                取消
              </button>
              <button className="danger-button" type="button" onClick={confirmDelete}>
                确认删除
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
