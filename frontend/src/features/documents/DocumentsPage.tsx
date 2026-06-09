import { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { documentsApi } from '../../api/documents';
import type { DocumentDto } from '../../types/document';
import { DocumentTable } from './DocumentTable';

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await documentsApi.list({ page: 0, size: 20 });
      setDocuments(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文档列表加载失败');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  return (
    <section className="feature-page">
      <div className="page-heading">
        <div>
          <h1>文档中心</h1>
          <p>查看已上传文档的解析状态、分块数量和失败原因。</p>
        </div>
        <button className="secondary-button" type="button" onClick={loadDocuments}>
          <RotateCcw size={16} />
          刷新
        </button>
      </div>
      <article className="panel page-panel">
        <DocumentTable documents={documents} error={error} loading={loading} onRefresh={loadDocuments} />
      </article>
    </section>
  );
}
