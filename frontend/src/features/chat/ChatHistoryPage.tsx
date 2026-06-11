import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Archive, Download, HelpCircle, MessageCircle, MoreHorizontal, Plus, SendHorizontal, Trash2 } from 'lucide-react';
import {
  chatApi as defaultChatApi,
  type ChatApi,
  type ChatCitationDto,
  type ChatDocumentDto,
  type ChatSessionDetailDto,
  type ChatSessionSummaryDto,
} from '../../api/chat';
import { AnswerContent } from './components/AnswerContent';
import { DocumentFileIcon } from './components/DocumentFileIcon';
import { formatBytes, formatDateTime, getSessionCitations, toSessionSummary } from './chatFormat';

interface ChatHistoryPageProps {
  chatApi?: ChatApi;
  initialDocumentId?: number;
}

function documentSubtitle(document: ChatDocumentDto): string {
  return `${document.format} · ${formatBytes(document.sizeBytes)} · ${document.sessionCount} 次对话`;
}

export function ChatHistoryPage({ chatApi = defaultChatApi, initialDocumentId }: ChatHistoryPageProps) {
  const [documents, setDocuments] = useState<ChatDocumentDto[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(initialDocumentId ?? null);
  const [sessions, setSessions] = useState<ChatSessionSummaryDto[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSessionDetailDto | null>(null);
  const [question, setQuestion] = useState('');
  const [selectedCitationKey, setSelectedCitationKey] = useState<string | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'help' | 'trash' | 'delete' | 'rename' | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  useEffect(() => {
    let alive = true;

    const loadDocuments = async () => {
      setLoadingDocuments(true);
      setError(null);
      try {
        const result = await chatApi.listDocuments();
        if (!alive) return;
        setDocuments(result);
        setSelectedDocumentId((current) => current ?? initialDocumentId ?? result[0]?.id ?? null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '对话文档加载失败');
      } finally {
        if (alive) setLoadingDocuments(false);
      }
    };

    void loadDocuments();

    return () => {
      alive = false;
    };
  }, [chatApi, initialDocumentId]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setSessions([]);
      setActiveSession(null);
      return;
    }

    let alive = true;

    const loadSessions = async () => {
      setLoadingSessions(true);
      setError(null);
      try {
        const result = await chatApi.listSessions(selectedDocumentId);
        if (!alive) return;
        setSessions(result);
        if (result[0]) {
          const detail = await chatApi.getSession(result[0].id);
          if (!alive) return;
          setActiveSession(detail);
          setSelectedCitationKey(detail.messages.find((message) => message.role === 'ASSISTANT' && message.citations[0])?.citations[0]?.key ?? null);
        } else {
          setActiveSession(null);
          setSelectedCitationKey(null);
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '对话历史加载失败');
      } finally {
        if (alive) setLoadingSessions(false);
      }
    };

    void loadSessions();

    return () => {
      alive = false;
    };
  }, [chatApi, selectedDocumentId]);

  const selectedDocument = useMemo(() => documents.find((document) => document.id === selectedDocumentId) ?? null, [documents, selectedDocumentId]);
  const citations = useMemo(() => getSessionCitations(activeSession), [activeSession]);

  const selectDocument = (documentId: number) => {
    setSelectedDocumentId(documentId);
    setQuestion('');
    setSelectedCitationKey(null);
  };

  const selectSession = async (sessionId: number) => {
    setError(null);
    try {
      const detail = await chatApi.getSession(sessionId);
      setActiveSession(detail);
      setSelectedCitationKey(detail.messages.find((message) => message.role === 'ASSISTANT' && message.citations[0])?.citations[0]?.key ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话详情加载失败');
    }
  };

  const createSession = async () => {
    if (!selectedDocumentId) return null;

    setCreatingSession(true);
    setError(null);
    try {
      const detail = await chatApi.createSession({ documentId: selectedDocumentId, title: '新对话' });
      setActiveSession(detail);
      setSelectedCitationKey(null);
      setSessions((current) => [toSessionSummary(detail), ...current.filter((session) => session.id !== detail.id)]);
      return detail;
    } catch (err) {
      setError(err instanceof Error ? err.message : '新建对话失败');
      return null;
    } finally {
      setCreatingSession(false);
    }
  };

  const sendQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || submitting || !selectedDocumentId) return;

    setSubmitting(true);
    setError(null);
    try {
      const session = activeSession ?? (await createSession());
      if (!session) return;
      const detail = await chatApi.sendMessage(session.id, { question: trimmedQuestion });
      setActiveSession(detail);
      setSessions((current) => [toSessionSummary(detail), ...current.filter((item) => item.id !== detail.id)]);
      setQuestion('');
      setSelectedCitationKey(detail.messages.find((message) => message.role === 'ASSISTANT' && message.citations[0])?.citations[0]?.key ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送问题失败');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteActiveSession = async () => {
    if (!activeSession) return;
    setError(null);
    try {
      await chatApi.deleteSession(activeSession.id);
      const remaining = sessions.filter((session) => session.id !== activeSession.id);
      setSessions(remaining);
      setActiveSession(null);
      setSelectedCitationKey(null);
      if (remaining[0]) {
        await selectSession(remaining[0].id);
      }
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除对话失败');
    }
  };

  const archiveActiveSession = async () => {
    if (!activeSession) return;
    setError(null);
    try {
      await chatApi.updateSession(activeSession.id, { archived: true });
      setSessions((current) => current.filter((session) => session.id !== activeSession.id));
      setActiveSession(null);
      setDialog('trash');
    } catch (err) {
      setError(err instanceof Error ? err.message : '归档对话失败');
    }
  };

  const renameActiveSession = async () => {
    if (!activeSession || !renameTitle.trim()) return;
    setError(null);
    try {
      const detail = await chatApi.updateSession(activeSession.id, { title: renameTitle.trim() });
      setActiveSession(detail);
      setSessions((current) => [toSessionSummary(detail), ...current.filter((session) => session.id !== detail.id)]);
      setDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重命名失败');
    }
  };

  const exportActiveSession = () => {
    if (!activeSession) return;
    const content = JSON.stringify(activeSession, null, 2);
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeSession.title || 'chat-session'}-${activeSession.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="feature-page chat-history-page">
      <div className="page-heading compact-heading">
        <div>
          <h1>对话历史</h1>
          <p>对话记录按当前文档进行分组管理，不同文档的对话相互独立，互不交叉。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => setDialog('help')}>
          <HelpCircle size={17} />
          使用说明
        </button>
      </div>

      {error ? <p className="inline-error page-error">{error}</p> : null}

      <div className="chat-history-layout">
        <aside className="panel history-documents-panel">
          <div className="panel-header">
            <h2>文档列表</h2>
            <button className="icon-button" disabled={!selectedDocumentId || creatingSession} type="button" aria-label="新增当前文档对话" onClick={() => void createSession()}>
              <Plus size={18} />
            </button>
          </div>
          <div className="history-document-list" aria-label="对话文档列表">
            {loadingDocuments ? <p className="table-state">正在加载文档...</p> : null}
            {!loadingDocuments && documents.length === 0 ? <p className="table-state">暂无可问答文档。</p> : null}
            {documents.map((document) => (
              <button
                className={document.id === selectedDocumentId ? 'history-document-item active' : 'history-document-item'}
                key={document.id}
                type="button"
                onClick={() => selectDocument(document.id)}
              >
                <DocumentFileIcon format={document.format} />
                <span>
                  <strong>{document.originalFilename}</strong>
                  <small>{documentSubtitle(document)}</small>
                </span>
              </button>
            ))}
          </div>
          <button className="secondary-button full-width" disabled={!activeSession} type="button" onClick={archiveActiveSession}>
            <Archive size={17} />
            回收站
          </button>
          <div className="document-scope-note">
            <strong>对话记录严格归属于当前文档</strong>
            <p>切换文档后，将仅显示该文档下的对话历史。</p>
          </div>
        </aside>

        <section className="panel history-sessions-panel">
          <div className="history-document-summary">
            <DocumentFileIcon format={selectedDocument?.format} />
            <div>
              <strong>{selectedDocument?.originalFilename ?? '请选择文档'}</strong>
              <small>{selectedDocument ? `${selectedDocument.chunkCount ?? 0} 个文本块 · ${selectedDocument.vectorCount ?? 0} 个向量` : '暂无文档'}</small>
            </div>
          </div>
          <div className="history-session-actions">
            <button className="primary-button" disabled={!selectedDocumentId || creatingSession} type="button" onClick={() => void createSession()}>
              <MessageCircle size={17} />
              新建对话
            </button>
            <button className="secondary-button" disabled={!activeSession} type="button" onClick={exportActiveSession}>
              <Download size={17} />
              导出记录
            </button>
            <button className="secondary-button" disabled={!activeSession} type="button" onClick={() => setDialog('delete')}>
              <Trash2 size={17} />
              删除
            </button>
          </div>
          <div className="history-session-list" aria-label="当前文档对话列表">
            {loadingSessions ? <p className="table-state">正在加载对话...</p> : null}
            {!loadingSessions && sessions.length === 0 ? <p className="table-state">暂无对话，点击新建对话开始。</p> : null}
            {sessions.map((session) => (
              <button
                className={session.id === activeSession?.id ? 'history-session-item active' : 'history-session-item'}
                key={session.id}
                type="button"
                onClick={() => void selectSession(session.id)}
              >
                <span>
                  <strong>{session.title}</strong>
                  <small>
                    {session.messageCount} 条消息 · 科大人
                  </small>
                </span>
                <time>{formatDateTime(session.updatedAt)}</time>
                <MoreHorizontal size={18} />
              </button>
            ))}
          </div>
        </section>

        <section className="panel history-conversation-panel">
          <div className="history-conversation-header">
            <div>
              <h2>{activeSession?.title ?? '当前对话'}</h2>
              <p>
                {activeSession
                  ? `${activeSession.messages.length} 条消息 · 创建于 ${formatDateTime(activeSession.createdAt)} · 最后活跃 ${formatDateTime(activeSession.updatedAt)}`
                  : '请选择或新建一个对话。'}
              </p>
            </div>
            <button
              className="icon-button"
              disabled={!activeSession}
              type="button"
              aria-label="更多操作"
              onClick={() => {
                setRenameTitle(activeSession?.title ?? '');
                setDialog('rename');
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          <div className="history-conversation-messages" aria-label="当前会话消息">
            {!activeSession ? <p className="table-state">请选择左侧对话，或基于当前文档新建对话。</p> : null}
            {activeSession && activeSession.messages.length === 0 ? <p className="table-state">当前对话暂无消息。</p> : null}
            {activeSession?.messages.map((message) => {
              const isAssistant = message.role === 'ASSISTANT';
              return (
                <article className={isAssistant ? 'history-message assistant' : 'history-message user'} key={message.id}>
                  <div className="history-message-avatar">{isAssistant ? 'AI' : '科'}</div>
                  <div className="history-message-body">
                    <div className="history-message-meta">
                      <strong>{isAssistant ? 'RAG 助手' : '科大人'}</strong>
                      <span>{formatDateTime(message.createdAt)}</span>
                    </div>
                    {isAssistant ? (
                      <AnswerContent content={message.content} citations={message.citations} messageId={message.id} onSelectCitation={(citation) => setSelectedCitationKey(citation.key)} />
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <form className="history-conversation-input" onSubmit={sendQuestion}>
            <textarea aria-label="继续提问" placeholder="继续提问或输入 @ 关联文档内容..." value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button className="primary-icon-button" disabled={!question.trim() || submitting || !selectedDocumentId} type="submit" aria-label="发送">
              <SendHorizontal size={18} />
            </button>
          </form>
          <p className="conversation-scope">
            当前引用：{citations.find((citation: ChatCitationDto) => citation.key === selectedCitationKey)?.chunkId ?? '暂无选中引用'}
          </p>
        </section>
      </div>

      {dialog ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="chat-dialog-title" aria-modal="true" className="confirm-dialog plain-dialog" role="dialog">
            <div className="confirm-dialog-content">
              <h2 id="chat-dialog-title">
                {dialog === 'help' ? '使用说明' : dialog === 'trash' ? '回收站' : dialog === 'delete' ? '删除对话' : '重命名对话'}
              </h2>
              {dialog === 'help' ? <p>选择文档后可新建、切换、导出、归档或删除该文档下的对话。</p> : null}
              {dialog === 'trash' ? <p>当前对话已归档，不再显示在当前文档的对话列表中。</p> : null}
              {dialog === 'delete' ? <p>确认删除当前对话“{activeSession?.title}”吗？删除后无法从列表恢复。</p> : null}
              {dialog === 'rename' ? (
                <label className="dialog-field">
                  对话标题
                  <input value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} />
                </label>
              ) : null}
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setDialog(null)}>
                {dialog === 'help' || dialog === 'trash' ? '关闭' : '取消'}
              </button>
              {dialog === 'delete' ? (
                <button className="danger-button" type="button" onClick={() => void deleteActiveSession()}>
                  确认删除
                </button>
              ) : null}
              {dialog === 'rename' ? (
                <button className="primary-button" disabled={!renameTitle.trim()} type="button" onClick={() => void renameActiveSession()}>
                  保存
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
