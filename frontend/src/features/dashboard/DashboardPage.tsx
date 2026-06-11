import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, CloudUpload, Database, MessageCircle, RotateCcw } from 'lucide-react';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import { demoActivities, demoDocuments, demoStats, processSteps, type DashboardStat } from '../../data/demo';
import type { DocumentDto } from '../../types/document';
import { DocumentTable } from '../documents/DocumentTable';

interface DashboardPageProps {
  documentsApi?: Pick<DocumentsApi, 'list'>;
  onNavigate: (view: 'documents' | 'upload' | 'chat') => void;
}

function buildStats(documents: DocumentDto[], total: number): DashboardStat[] {
  const readyCount = documents.filter((document) => document.status === 'READY').length;
  const vectorCount = documents.reduce((sum, document) => sum + (document.vectorCount ?? 0), 0);

  return demoStats.map((stat) => {
    if (stat.label === '文档总数') return { ...stat, value: String(total || documents.length), trend: '' };
    if (stat.label === '已解析文档') return { ...stat, value: String(readyCount), trend: documents.length ? `${Math.round((readyCount / documents.length) * 100)}%` : '0%' };
    if (stat.label === '向量总数') return { ...stat, value: vectorCount.toLocaleString('zh-CN') };
    return { ...stat, value: '0', trend: '' };
  });
}

export function DashboardPage({ documentsApi = defaultDocumentsApi, onNavigate }: DashboardPageProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>(demoDocuments);
  const [total, setTotal] = useState(demoDocuments.length);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setError(null);
    try {
      const result = await documentsApi.list({ page: 0, size: 5 });
      setDocuments(result.items);
      setTotal(result.total);
    } catch {
      setDocuments(demoDocuments);
      setTotal(128);
      setError('后端暂不可用，当前显示本地占位数据。');
    }
  }, [documentsApi]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const stats = useMemo(() => (error || documents === demoDocuments ? demoStats : buildStats(documents, total)), [documents, error, total]);

  return (
    <>
      <section className="hero-section">
        <div>
          <h1>文档工作台</h1>
          <p>欢迎回来！在这里管理您的文档资源，发起智能问答，获取精准知识洞察。</p>
        </div>
      </section>

      {error ? (
        <section className="dashboard-alert">
          <span>{error}</span>
          <button className="secondary-button" type="button" onClick={loadDocuments}>
            <RotateCcw size={15} />
            刷新
          </button>
        </section>
      ) : null}

      <section className="stats-grid" aria-label="统计概览">
        {stats.map(({ icon: Icon, ...item }) => (
          <article className={`stat-card ${item.tone}`} key={item.label}>
            <div className="stat-copy">
              <span>{item.label}</span>
              <div className="stat-value">
                <strong>{item.value}</strong>
                <em>{item.unit}</em>
              </div>
              <small>
                {item.metaLabel}
                {item.trend ? <b className="trend-value"> {item.trend}</b> : null}
              </small>
            </div>
            <div className="stat-icon" data-testid="stat-icon">
              <Icon size={34} />
            </div>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <article className="panel documents-panel">
          <div className="panel-heading">
            <h2>最近上传的文档</h2>
            <button className="link-button" type="button" onClick={() => onNavigate('documents')}>
              查看全部
              <ChevronRight size={16} />
            </button>
          </div>
          <DocumentTable documents={documents.slice(0, 3)} />
        </article>

        <article className="panel actions-panel">
          <h2>快捷操作</h2>
          <button type="button" onClick={() => onNavigate('upload')}>
            <CloudUpload size={22} />
            <span>
              上传新文档
              <small>PDF / TXT / Word</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => onNavigate('chat')}>
            <MessageCircle size={22} />
            <span>
              新建对话
              <small>基于知识库发起智能问答</small>
            </span>
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={() => onNavigate('documents')}>
            <Database size={22} />
            <span>
              查看向量库
              <small>浏览文档向量与索引信息</small>
            </span>
            <ChevronRight size={18} />
          </button>
        </article>

        <article className="panel process-panel" aria-label="RAG 检索增强生成流程">
          <h2>RAG 检索增强生成流程</h2>
          <ol className="process-list">
            {processSteps.map(({ icon: Icon, ...step }, index) => (
              <li className={`process-step ${step.tone}`} key={step.label}>
                <div className="process-icon" data-testid="process-icon">
                  <Icon size={42} />
                </div>
                <span className="step-number">{index + 1}</span>
                <strong>{step.label}</strong>
                <p>{step.detail}</p>
              </li>
            ))}
          </ol>
        </article>

        <article className="panel activity-panel">
          <div className="panel-heading">
            <h2>最近动态</h2>
            <button className="link-button" type="button" onClick={() => onNavigate('documents')}>
              查看全部
              <ChevronRight size={16} />
            </button>
          </div>
          <ol>
            {demoActivities.map((activity) => (
              <li className={activity.tone} key={activity.label}>
                <span />
                <div>
                  <strong>{activity.label}</strong>
                  <time>{activity.time}</time>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </>
  );
}
