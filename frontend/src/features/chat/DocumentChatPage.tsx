import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, ChevronRight, Eraser, FileSearch, SendHorizontal, Settings2, Target } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);

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

  const createSession = async (title: string) => {
    if (!selectedDocumentId) return null;
    const detail = await chatApi.createSession({ documentId: selectedDocumentId, title });
    setActiveSession(detail);
    setCitationMessageId(null);
    setSelectedCitationKey(null);
    setSessions((current) => [toSessionSummary(detail), ...current.filter((session) => session.id !== detail.id)]);
    return detail;
  };

  const sendQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !selectedDocumentId || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const session = activeSession ?? (await createSession(titleFromQuestion(trimmedQuestion)));
      if (!session) return;
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
      setQuestion('');
      setStreamingDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '发送问题失败');
      setStreamingDraft(null);
    } finally {
      setSubmitting(false);
    }
  };

  const selectDocument = (documentId: number) => {
    setSelectedDocumentId(documentId);
    setActiveSession(null);
    setQuestion('');
    setSelectedCitationKey(null);
    setCitationMessageId(null);
    setExpandedCitation(null);
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
                      ? `${selectedDocument.format} · ${formatBytes(selectedDocument.sizeBytes)} · 上传于 ${formatDateTime(selectedDocument.lastActiveAt ?? null)}`
                      : '请先上传并解析文档'}
                  </em>
                </span>
              </div>
            </div>
            <select aria-label="更换文档" value={selectedDocumentId ?? ''} onChange={(event) => selectDocument(Number(event.target.value))}>
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.originalFilename}
                </option>
              ))}
            </select>
          </div>

          <div className="document-chat-thread" aria-label="文档问答消息">
            {!activeSession ? (
              <div className="empty-chat-state">
                <FileSearch size={28} />
                <strong>请选择一个已解析文档，或直接输入问题开始问答。</strong>
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
          </div>

          <form className="qa-composer" onSubmit={sendQuestion}>
            <textarea
              aria-label="输入文档问题"
              maxLength={2000}
              placeholder="请输入你想了解的文档内容..."
              ref={questionInputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
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
    </section>
  );
}
