import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronRight, Eraser, FileSearch, History, MessageCircle, Plus, SendHorizontal, Settings2, Target, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import {
  chatApi as defaultChatApi,
  type ChatApi,
  type ChatCitationDto,
  type ChatDocumentDto,
  type ChatSessionDetailDto,
  type ChatSessionSummaryDto,
} from '../../api/chat';
import { settingsApi as defaultSettingsApi, type SettingsResponse } from '../../api/settings';
import { AnswerContent } from './components/AnswerContent';
import { DocumentFileIcon } from './components/DocumentFileIcon';
import { formatBytes, formatDateTime, latestAssistantMessage, titleFromQuestion, toSessionSummary } from './chatFormat';

interface DocumentChatPageProps {
  chatApi?: ChatApi;
  settingsApi?: typeof defaultSettingsApi;
  initialDocumentId?: number;
  onOpenSettings?: () => void;
}

interface StreamingDraft {
  sessionId: number;
  question: string;
  answer: string;
  startedAt: string;
}

function citationTitle(index: number): string {
  return `引用片段 [${index + 1}]`;
}

function CitationMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]}>
      {text}
    </ReactMarkdown>
  );
}

export function DocumentChatPage({ chatApi = defaultChatApi, settingsApi = defaultSettingsApi, initialDocumentId, onOpenSettings }: DocumentChatPageProps) {
  const [documents, setDocuments] = useState<ChatDocumentDto[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(initialDocumentId ?? null);
  const [sessions, setSessions] = useState<ChatSessionSummaryDto[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSessionDetailDto | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [streamingDraft, setStreamingDraft] = useState<StreamingDraft | null>(null);
  const [question, setQuestion] = useState('');
  const [selectedCitationKey, setSelectedCitationKey] = useState<string | null>(null);
  const [citationMessageId, setCitationMessageId] = useState<number | null>(null);
  const [expandedCitation, setExpandedCitation] = useState<ChatCitationDto | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    let alive = true;

    settingsApi
      .get()
      .then((result) => {
        if (alive) setSettings(result);
      })
      .catch(() => {
        if (alive) setSettings(null);
      });

    return () => {
      alive = false;
    };
  }, [settingsApi]);

  useEffect(() => {
    let alive = true;

    const loadDocuments = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await chatApi.listDocuments();
        if (!alive) return;
        setDocuments(result);
        setSelectedDocumentId((current) => current ?? initialDocumentId ?? result[0]?.id ?? null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '问答文档加载失败');
      } finally {
        if (alive) setLoading(false);
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
      setError(null);
      try {
        const result = await chatApi.listSessions(selectedDocumentId);
        if (!alive) return;
        setSessions(result);
        if (result[0]) {
          const detail = await chatApi.getSession(result[0].id);
          if (!alive) return;
          const latestAssistant = latestAssistantMessage(detail.messages);
          setActiveSession(detail);
          setCitationMessageId(latestAssistant?.id ?? null);
          setSelectedCitationKey(latestAssistant?.citations[0]?.key ?? null);
        } else {
          setActiveSession(null);
          setCitationMessageId(null);
          setSelectedCitationKey(null);
        }
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : '文档问答加载失败');
      }
    };

    void loadSessions();

    return () => {
      alive = false;
    };
  }, [chatApi, selectedDocumentId]);

  const selectedDocument = useMemo(() => documents.find((document) => document.id === selectedDocumentId) ?? null, [documents, selectedDocumentId]);
  const citationMessage = useMemo(() => {
    const assistantMessages = activeSession?.messages.filter((message) => message.role === 'ASSISTANT' && message.citations.length > 0) ?? [];
    const fallbackMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;
    return assistantMessages.find((message) => message.id === citationMessageId) ?? fallbackMessage;
  }, [activeSession, citationMessageId]);
  const citations: ChatCitationDto[] = citationMessage?.citations ?? [];
  const topK = settings?.rag.topK ?? 5;
  const llmName = settings?.llm.model.replace(/:free$/u, '') ?? '加载中';
  const embeddingName = settings?.embedding.model.replace(/:free$/u, '') ?? '加载中';

  useEffect(() => {
    const input = questionInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 126)}px`;
    input.classList.toggle('is-scrollable', input.scrollHeight > 126);
  }, [question]);

  useEffect(() => {
    if (!autoScrollRef.current) return;
    threadEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [activeSession?.id, activeSession?.messages.length, streamingDraft?.answer, streamingDraft?.question]);

  const createSession = async (title = '新对话') => {
    if (!selectedDocumentId) return null;
    setCreatingSession(true);
    setError(null);
    try {
      const detail = await chatApi.createSession({ documentId: selectedDocumentId, title });
      autoScrollRef.current = true;
      setActiveSession(detail);
      setCitationMessageId(null);
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

  const submitQuestion = async () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !selectedDocumentId || submitting) return;

    autoScrollRef.current = true;
    setSubmitting(true);
    setError(null);
    setQuestion('');
    try {
      const session = activeSession ?? (await createSession(titleFromQuestion(trimmedQuestion)));
      if (!session) {
        setQuestion(trimmedQuestion);
        return;
      }
      let detail: ChatSessionDetailDto;
      if (settings?.llm.streamOutput) {
        const startedAt = new Date().toISOString();
        setStreamingDraft({ sessionId: session.id, question: trimmedQuestion, answer: '', startedAt });
        detail = await chatApi.streamMessage(session.id, { question: trimmedQuestion }, {
          onChunk: (chunk) => {
            setStreamingDraft((current) => (current && current.sessionId === session.id ? { ...current, answer: current.answer + chunk } : current));
          },
        });
      } else {
        detail = await chatApi.sendMessage(session.id, { question: trimmedQuestion });
      }
      const latestAssistant = latestAssistantMessage(detail.messages);
      setActiveSession(detail);
      setSessions((current) => [toSessionSummary(detail), ...current.filter((item) => item.id !== detail.id)]);
      setCitationMessageId(latestAssistant?.id ?? null);
      setSelectedCitationKey(latestAssistant?.citations[0]?.key ?? null);
      setStreamingDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送问题失败');
      setQuestion(trimmedQuestion);
      setStreamingDraft(null);
    } finally {
      setSubmitting(false);
    }
  };

  const sendQuestion = (event: FormEvent) => {
    event.preventDefault();
    void submitQuestion();
  };

  const insertQuestionNewline = () => {
    const input = questionInputRef.current;
    const start = input?.selectionStart ?? question.length;
    const end = input?.selectionEnd ?? question.length;
    const nextQuestion = `${question.slice(0, start)}\n${question.slice(end)}`;
    setQuestion(nextQuestion);
    window.requestAnimationFrame(() => {
      questionInputRef.current?.setSelectionRange(start + 1, start + 1);
    });
  };

  const handleQuestionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      insertQuestionNewline();
      return;
    }
    if (!event.shiftKey && !event.altKey) {
      event.preventDefault();
      void submitQuestion();
    }
  };

  const selectDocument = (documentId: number) => {
    autoScrollRef.current = true;
    setSelectedDocumentId(documentId);
    setActiveSession(null);
    setQuestion('');
    setSelectedCitationKey(null);
    setCitationMessageId(null);
    setExpandedCitation(null);
  };

  const selectSession = async (sessionId: number) => {
    autoScrollRef.current = true;
    setError(null);
    try {
      const detail = await chatApi.getSession(sessionId);
      const latestAssistant = latestAssistantMessage(detail.messages);
      setActiveSession(detail);
      setCitationMessageId(latestAssistant?.id ?? null);
      setSelectedCitationKey(latestAssistant?.citations[0]?.key ?? null);
      setHistoryDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话详情加载失败');
    }
  };

  const disableAutoScrollForUserNavigation = () => {
    autoScrollRef.current = false;
  };

  const restoreAutoScrollWhenAtBottom = () => {
    const thread = threadRef.current;
    if (!thread) return;
    const distanceToBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    if (distanceToBottom <= 24) {
      autoScrollRef.current = true;
    }
  };

  return (
    <section className="feature-page document-chat-page">
      <div className="document-chat-heading">
        <div>
          <h1>文档问答</h1>
          <p>基于您选择的文档进行智能问答，所有回答均基于文档内容生成，并提供可追溯的引用来源。</p>
        </div>
        <div className="chat-config-strip" aria-label="问答配置">
          <button className="chat-config-card" type="button" onClick={onOpenSettings}>
            <Bot size={20} />
            <span>
              <small>模型</small>
              <strong>{llmName}</strong>
            </span>
            <ChevronRight size={16} />
          </button>
          <button className="chat-config-card" type="button" onClick={onOpenSettings}>
            <Settings2 size={20} />
            <span>
              <small>嵌入模型</small>
              <strong>{embeddingName}</strong>
            </span>
            <ChevronRight size={16} />
          </button>
          <button className="chat-config-card" type="button" onClick={onOpenSettings}>
            <Target size={20} />
            <span>
              <small>检索 Top-K</small>
              <strong>{topK}</strong>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error ? <p className="inline-error page-error">{error}</p> : null}

      <div className="document-chat-layout">
        <section className="document-chat-main">
          <div className="current-document-card">
            <div>
              <small>当前文档（知识库上下文）</small>
              <div className="current-document-content">
                <DocumentFileIcon format={selectedDocument?.format} testId="current-document-file-icon" />
                <span>
                  <strong>{selectedDocument?.originalFilename ?? (loading ? '正在加载文档...' : '暂无 READY 文档')}</strong>
                  <em>
                    {selectedDocument
                      ? `${selectedDocument.format} · ${formatBytes(selectedDocument.sizeBytes)} · 上传于 ${formatDateTime(selectedDocument.uploadedAt)}`
                      : '请先上传并解析文档'}
                  </em>
                </span>
              </div>
            </div>
            <div className="current-document-actions">
              <select aria-label="更换文档" value={selectedDocumentId ?? ''} onChange={(event) => selectDocument(Number(event.target.value))}>
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.originalFilename}
                  </option>
                ))}
              </select>
              <button className="secondary-button compact-action" disabled={!selectedDocumentId || creatingSession} type="button" onClick={() => void createSession()}>
                <Plus size={16} />
                新建对话
              </button>
              <button className="secondary-button compact-action" disabled={!selectedDocumentId} type="button" onClick={() => setHistoryDialogOpen(true)}>
                <History size={16} />
                历史对话
              </button>
            </div>
          </div>

          <div
            aria-label="文档问答消息"
            className="document-chat-thread"
            ref={threadRef}
            onScroll={restoreAutoScrollWhenAtBottom}
            onTouchMove={disableAutoScrollForUserNavigation}
            onWheel={disableAutoScrollForUserNavigation}
          >
            {!activeSession ? (
              <div className="empty-chat-state">
                <FileSearch size={28} />
                <strong>请选择一个已解析文档，或直接输入问题开始问答。</strong>
              </div>
            ) : null}
            {activeSession && activeSession.messages.length === 0 ? (
              <div className="empty-chat-state compact-empty-state">
                <MessageCircle size={28} />
                <strong>当前对话暂无消息，可以直接输入问题开始。</strong>
              </div>
            ) : null}
            {activeSession?.messages.map((message) => {
              const isAssistant = message.role === 'ASSISTANT';
              return (
                <article className={isAssistant ? 'qa-message assistant' : 'qa-message user'} key={message.id}>
                  <div className="qa-avatar">{isAssistant ? <Bot size={18} /> : '我'}</div>
                  <div className="qa-message-body">
                    <div className="qa-message-meta">
                      <strong>{isAssistant ? 'AI 助手' : '我'}</strong>
                      <span>{formatDateTime(message.createdAt)}</span>
                      {isAssistant ? <em>基于检索到的文档生成</em> : null}
                    </div>
                    {isAssistant ? (
                      <AnswerContent
                        content={message.content}
                        citations={message.citations}
                        messageId={message.id}
                        onSelectCitation={(citation) => {
                          setCitationMessageId(message.id);
                          setSelectedCitationKey(citation.key);
                        }}
                      />
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </div>
                </article>
              );
            })}
            {streamingDraft ? (
              <>
                <article className="qa-message user">
                  <div className="qa-avatar">我</div>
                  <div className="qa-message-body">
                    <div className="qa-message-meta">
                      <strong>我</strong>
                      <span>{formatDateTime(streamingDraft.startedAt)}</span>
                    </div>
                    <p>{streamingDraft.question}</p>
                  </div>
                </article>
                <article className="qa-message assistant streaming">
                  <div className="qa-avatar">
                    <Bot size={18} />
                  </div>
                  <div className="qa-message-body">
                    <div className="qa-message-meta">
                      <strong>AI 助手</strong>
                      <span>{formatDateTime(streamingDraft.startedAt)}</span>
                      <em>正在生成</em>
                    </div>
                    <AnswerContent content={streamingDraft.answer || ' '} citations={[]} messageId={-1} onSelectCitation={() => undefined} />
                  </div>
                </article>
              </>
            ) : null}
            <div className="chat-scroll-anchor" ref={threadEndRef} />
          </div>

          <form className="qa-composer" onSubmit={sendQuestion}>
            <textarea
              aria-label="输入文档问题"
              maxLength={2000}
              placeholder="请输入你想了解的文档内容..."
              ref={questionInputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleQuestionKeyDown}
            />
            <span>{question.length} / 2000</span>
            <button className="primary-icon-button" disabled={!question.trim() || submitting || !selectedDocumentId} type="submit" aria-label="发送问题">
              <SendHorizontal size={20} />
            </button>
            <button className="secondary-button" type="button" onClick={() => setQuestion('')}>
              <Eraser size={16} />
              清空
            </button>
          </form>
        </section>

        <aside className="document-citation-panel" aria-label="引用片段列表">
          <div className="panel-header">
            <h2>引用片段</h2>
            <small>{citationMessage ? `回答 #${citationMessage.id} · Top-K` : '检索结果 Top-K'}</small>
          </div>
          <div className="document-citation-list">
            {citations.length === 0 ? <p className="table-state">暂无引用。提交问题后会显示 Top-K 检索片段。</p> : null}
            {citations.map((citation, index) => (
              <button
                className={citation.key === selectedCitationKey ? 'document-citation-card selected' : 'document-citation-card'}
                key={citation.key}
                type="button"
                onClick={() => {
                  setSelectedCitationKey(citation.key);
                  setExpandedCitation(citation);
                }}
              >
                <span className={`citation-rank rank-${index + 1}`}>{index + 1}</span>
                <span className="document-citation-body">
                  <strong>{citationTitle(index)}</strong>
                  <em>相似度 {(citation.score * 100).toFixed(0)}% · score {citation.score.toFixed(2)}</em>
                  <span className="citation-preview markdown-body">
                    <CitationMarkdown text={citation.text} />
                  </span>
                  <span>
                    来源：{citation.page ? `第 ${citation.page} 页` : citation.filename} <b>Chunk: {citation.chunkId}</b>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {expandedCitation ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="citation-dialog-title" aria-modal="true" className="confirm-dialog citation-dialog plain-dialog" role="dialog">
            <div className="confirm-dialog-content">
              <h2 id="citation-dialog-title">
                {citationTitle(Math.max(0, citations.findIndex((citation) => citation.key === expandedCitation.key)))}
              </h2>
              <p>
                相似度 {(expandedCitation.score * 100).toFixed(0)}% · score {expandedCitation.score.toFixed(2)} ·{' '}
                {expandedCitation.page ? `第 ${expandedCitation.page} 页` : expandedCitation.filename} · Chunk: {expandedCitation.chunkId}
              </p>
              <div className="citation-dialog-text markdown-body">
                <CitationMarkdown text={expandedCitation.text} />
              </div>
            </div>
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={() => setExpandedCitation(null)}>
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {historyDialogOpen ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="chat-history-dialog-title" aria-modal="true" className="confirm-dialog chat-session-dialog plain-dialog" role="dialog">
            <div className="activity-dialog-heading">
              <div>
                <h2 id="chat-history-dialog-title">历史对话</h2>
                <p>仅显示当前文档下的对话记录。</p>
              </div>
              <button aria-label="关闭历史对话" className="icon-button" type="button" onClick={() => setHistoryDialogOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="chat-session-dialog-list" aria-label="当前文档历史对话">
              {sessions.length === 0 ? <p className="table-state">当前文档暂无历史对话。</p> : null}
              {sessions.map((session) => (
                <button
                  className={session.id === activeSession?.id ? 'chat-session-dialog-item active' : 'chat-session-dialog-item'}
                  key={session.id}
                  type="button"
                  onClick={() => void selectSession(session.id)}
                >
                  <span>
                    <strong>{session.title}</strong>
                    <small>{session.messageCount} 条消息 · 更新于 {formatDateTime(session.updatedAt)}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
