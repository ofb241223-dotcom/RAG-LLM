import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, CloudUpload, Database, MessageCircle, RotateCcw, X } from 'lucide-react';
import { chatApi as defaultChatApi, type ChatApi, type ChatDocumentDto, type ChatSessionSummaryDto } from '../../api/chat';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import { demoDocuments, demoStats, processSteps, type DashboardStat } from '../../data/demo';
import type { DocumentActivityDto, DocumentDto } from '../../types/document';
import { formatDateTime } from '../chat/chatFormat';
import { DocumentTable } from '../documents/DocumentTable';

interface DashboardPageProps {
  documentsApi?: Pick<DocumentsApi, 'list'> & Partial<Pick<DocumentsApi, 'activities'>>;
  chatApi?: Pick<ChatApi, 'listSessions'> & Partial<Pick<ChatApi, 'listDocuments'>>;
  onNavigate: (view: 'documents' | 'upload' | 'chat') => void;
}

interface DashboardActivity {
  id: string;
  label: string;
  time: string;
  timestamp: number;
  tone: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

const RECENT_ACTIVITY_LIMIT = 5;

function buildStats(documents: DocumentDto[], total: number, conversationTotal: number): DashboardStat[] {
  const readyCount = documents.filter((document) => document.status === 'READY').length;
  const vectorCount = documents
    .filter((document) => document.status === 'READY')
    .reduce((sum, document) => sum + (document.vectorCount ?? 0), 0);

  return demoStats.map((stat) => {
    if (stat.label === '文档总数') return { ...stat, value: String(total || documents.length), metaLabel: '', trend: '' };
    if (stat.label === '已解析文档') return { ...stat, value: String(readyCount), trend: documents.length ? `${Math.round((readyCount / documents.length) * 100)}%` : '0%' };
    if (stat.label === '向量总数') return { ...stat, value: vectorCount.toLocaleString('zh-CN') };
    if (stat.label === '对话总数') return { ...stat, value: conversationTotal.toLocaleString('zh-CN'), metaLabel: '', trend: '' };
    return stat;
  });
}

function timestampOf(value?: string | null): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function documentTitle(filename: string): string {
  return filename.replace(/\.(pdf|txt|docx|doc|xlsx|xls)$/iu, '');
}

function newestActivities(activities: DashboardActivity[]): DashboardActivity[] {
  return sortActivities(activities).slice(0, RECENT_ACTIVITY_LIMIT);
}

function sortActivities(activities: DashboardActivity[]): DashboardActivity[] {
  const seen = new Set<string>();
  return activities
    .filter((activity) => activity.timestamp > 0)
    .filter((activity) => {
      const key = `${activity.tone}|${activity.timestamp}|${activity.label}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

function buildDocumentActivities(documents: DocumentDto[]): DashboardActivity[] {
  return documents.flatMap((document) => {
    const activities: DashboardActivity[] = [
      {
        id: `upload-${document.id}`,
        label: `上传了文档《${document.originalFilename}》`,
        time: formatDateTime(document.uploadedAt),
        timestamp: timestampOf(document.uploadedAt),
        tone: 'blue',
      },
    ];

    if (document.status === 'READY') {
      const updatedTimestamp = timestampOf(document.updatedAt);
      activities.push({
        id: `ready-${document.id}`,
        label: `文档《${document.originalFilename}》解析完成`,
        time: formatDateTime(document.updatedAt),
        timestamp: updatedTimestamp,
        tone: 'green',
      });
      if ((document.vectorCount ?? 0) > 0) {
        activities.push({
          id: `vector-${document.id}`,
          label: `向量库更新完成，新增 ${(document.vectorCount ?? 0).toLocaleString('zh-CN')} 个向量`,
          time: formatDateTime(document.updatedAt),
          timestamp: updatedTimestamp,
          tone: 'orange',
        });
      }
    }

    return activities;
  });
}

function buildChatActivities(documents: DocumentDto[], sessionsByDocument: Map<number, ChatSessionSummaryDto[]>): DashboardActivity[] {
  return documents.flatMap((document) =>
    (sessionsByDocument.get(document.id) ?? [])
      .filter((session) => session.messageCount > 0)
      .map((session) => ({
        id: `chat-${session.id}`,
        label: `与文档《${documentTitle(document.originalFilename)}》进行了问答`,
        time: formatDateTime(session.updatedAt),
        timestamp: timestampOf(session.updatedAt),
        tone: 'purple' as const,
      })),
  );
}

function activityTone(tone: DocumentActivityDto['tone']): DashboardActivity['tone'] {
  return tone.toLowerCase() as DashboardActivity['tone'];
}

function buildPersistedActivities(activities: DocumentActivityDto[]): DashboardActivity[] {
  return activities.map((activity) => ({
    id: `persisted-${activity.id}`,
    label: activity.label,
    time: formatDateTime(activity.occurredAt),
    timestamp: timestampOf(activity.occurredAt),
    tone: activityTone(activity.tone),
  }));
}

export function DashboardPage({ documentsApi = defaultDocumentsApi, chatApi = defaultChatApi, onNavigate }: DashboardPageProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>(demoDocuments);
  const [total, setTotal] = useState(demoDocuments.length);
  const [conversationTotal, setConversationTotal] = useState(0);
  const [allActivities, setAllActivities] = useState<DashboardActivity[]>([]);
  const [activityDialogOpen, setActivityDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setError(null);
    try {
      const result = await documentsApi.list({ page: 0, size: 10 });
      setDocuments(result.items);
      setTotal(result.total);
      const documentActivities = buildDocumentActivities(result.items);
      setAllActivities(sortActivities(documentActivities));
      const sessionResults = await Promise.allSettled(result.items.map((document) => chatApi.listSessions(document.id)));
      const chatDocumentsResult = await (chatApi.listDocuments
        ? chatApi.listDocuments().then(
            (items: ChatDocumentDto[]) => items.reduce((sum, document) => sum + document.sessionCount, 0),
            () => null,
          )
        : Promise.resolve(null));
      const persistedActivityResult = await (documentsApi.activities
        ? documentsApi.activities(50).then(
            (items) => buildPersistedActivities(items),
            () => [],
          )
        : Promise.resolve([]));
      const sessionsByDocument = new Map<number, ChatSessionSummaryDto[]>();
      result.items.forEach((document, index) => {
        const sessionResult = sessionResults[index];
        sessionsByDocument.set(document.id, sessionResult.status === 'fulfilled' ? sessionResult.value : []);
      });
      const visibleSessionTotal = Array.from(sessionsByDocument.values()).reduce((sum, sessions) => sum + sessions.length, 0);
      setConversationTotal(chatDocumentsResult ?? visibleSessionTotal);
      setAllActivities(sortActivities([...documentActivities, ...buildChatActivities(result.items, sessionsByDocument), ...persistedActivityResult]));
    } catch {
      setDocuments(demoDocuments);
      setTotal(128);
      setConversationTotal(0);
      setAllActivities([]);
      setError('后端暂不可用，当前显示本地占位数据。');
    }
  }, [chatApi, documentsApi]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const stats = useMemo(() => (error || documents === demoDocuments ? demoStats : buildStats(documents, total, conversationTotal)), [conversationTotal, documents, error, total]);
  const activities = useMemo(() => newestActivities(allActivities), [allActivities]);

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
              {item.metaLabel || item.trend ? (
                <small>
                  {item.metaLabel}
                  {item.trend ? <b className="trend-value"> {item.trend}</b> : null}
                </small>
              ) : null}
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
          <DocumentTable documents={documents.slice(0, 4)} />
        </article>

        <article className="panel actions-panel">
          <h2>快捷操作</h2>
          <button type="button" onClick={() => onNavigate('upload')}>
            <CloudUpload size={22} />
            <span>
              上传新文档
              <small>PDF / TXT / Word / Excel</small>
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
              查看向量索引
              <small>浏览已入库文档与文本块状态</small>
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
            <button className="link-button" type="button" onClick={() => setActivityDialogOpen(true)}>
              查看全部
              <ChevronRight size={16} />
            </button>
          </div>
          <ol>
            {activities.length > 0 ? activities.map((activity) => (
              <li className={activity.tone} key={activity.id}>
                <span />
                <div>
                  <strong>{activity.label}</strong>
                  <time>{activity.time}</time>
                </div>
              </li>
            )) : (
              <li className="blue">
                <span />
                <div>
                  <strong>暂无动态</strong>
                  <time>等待文档上传或问答记录</time>
                </div>
              </li>
            )}
          </ol>
        </article>
      </section>

      {activityDialogOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="activity-dialog-title" aria-modal="true" className="confirm-dialog wide-dialog activity-dialog" role="dialog">
            <div className="activity-dialog-heading">
              <div>
                <h2 id="activity-dialog-title">全部动态</h2>
                <p>按时间倒序展示文档上传、解析、向量入库和问答记录。</p>
              </div>
              <button aria-label="关闭全部动态" className="icon-button" type="button" onClick={() => setActivityDialogOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <ol className="activity-dialog-list">
              {allActivities.length > 0 ? allActivities.map((activity) => (
                <li className={activity.tone} key={activity.id}>
                  <span />
                  <div>
                    <strong>{activity.label}</strong>
                    <time>{activity.time}</time>
                  </div>
                </li>
              )) : (
                <li className="blue">
                  <span />
                  <div>
                    <strong>暂无动态</strong>
                    <time>等待文档上传或问答记录</time>
                  </div>
                </li>
              )}
            </ol>
          </section>
        </div>
      ) : null}
    </>
  );
}
