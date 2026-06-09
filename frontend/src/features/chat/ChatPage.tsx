import { FormEvent, useEffect, useMemo, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import { chatApi as defaultChatApi, type ChatApi } from '../../api/chat';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import type { ChatAnswerDto, CitationDto } from '../../types/chat';
import type { DocumentDto } from '../../types/document';

interface ChatPageProps {
  documentsApi?: Pick<DocumentsApi, 'list'>;
  chatApi?: Pick<ChatApi, 'ask'>;
}

function renderAnswer(answer: string, onSelectCitation: (index: number) => void) {
  const parts = answer.split(/(\[\d+\])/g);

  return parts.map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) {
      return <span key={`${part}-${index}`}>{part}</span>;
    }

    const citationIndex = Number(match[1]);
    return (
      <button className="answer-marker" key={`${part}-${index}`} type="button" aria-label={`引用 ${citationIndex}`} onClick={() => onSelectCitation(citationIndex - 1)}>
        {part}
      </button>
    );
  });
}

function getCitationKey(source: CitationDto): string {
  return `${source.documentId}-${source.chunkId}`;
}

export function ChatPage({ documentsApi = defaultDocumentsApi, chatApi = defaultChatApi }: ChatPageProps) {
  const [documents, setDocuments] = useState<DocumentDto[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<ChatAnswerDto | null>(null);
  const [selectedCitationKey, setSelectedCitationKey] = useState<string | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadDocuments = async () => {
      setLoadingDocuments(true);
      try {
        const result = await documentsApi.list({ page: 0, size: 50, status: 'READY' });
        if (!alive) return;
        const readyDocuments = result.items.filter((document) => document.status === 'READY');
        setDocuments(readyDocuments);
        setSelectedDocumentId(readyDocuments[0]?.id ? String(readyDocuments[0].id) : '');
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'READY 文档加载失败');
      } finally {
        if (alive) {
          setLoadingDocuments(false);
        }
      }
    };

    void loadDocuments();

    return () => {
      alive = false;
    };
  }, [documentsApi]);

  const selectedDocument = useMemo(
    () => documents.find((document) => String(document.id) === selectedDocumentId),
    [documents, selectedDocumentId],
  );

  const selectCitationByIndex = (index: number) => {
    const source = answer?.sources[index];
    if (source) {
      setSelectedCitationKey(getCitationKey(source));
    }
  };

  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    const documentId = Number(selectedDocumentId);

    if (!trimmedQuestion || !documentId) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await chatApi.ask({
        documentIds: [documentId],
        question: trimmedQuestion,
        topK: 5,
      });
      setAnswer(response);
      setSelectedCitationKey(response.sources[0] ? getCitationKey(response.sources[0]) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '问答请求失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="feature-page">
      <div className="page-heading">
        <div>
          <h1>文档问答</h1>
          <p>选择一个已完成解析的文档，提出问题后查看答案和引用片段。</p>
        </div>
      </div>

      <div className="chat-layout">
        <form className="panel chat-panel" onSubmit={submitQuestion}>
          <label>
            <span>问答文档</span>
            <select aria-label="选择问答文档" disabled={loadingDocuments || documents.length === 0} value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}>
              {documents.length === 0 ? <option value="">暂无 READY 文档</option> : null}
              {documents.map((document) => (
                <option key={document.id} value={document.id}>
                  {document.originalFilename}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>问题</span>
            <textarea aria-label="问题输入" placeholder="请输入你想基于文档提问的问题..." value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <button className="primary-button" disabled={submitting || !selectedDocument || !question.trim()} type="submit">
            <SendHorizontal size={16} />
            发送问题
          </button>
          {error ? <p className="inline-error">{error}</p> : null}

          {answer ? (
            <article className="answer-card">
              <h2>回答</h2>
              <p>{renderAnswer(answer.answer, selectCitationByIndex)}</p>
            </article>
          ) : (
            <article className="answer-card muted">
              <h2>回答</h2>
              <p>问题提交后，系统会展示答案和可追溯的引用片段。</p>
            </article>
          )}
        </form>

        <aside className="panel citation-panel">
          <h2>引用片段</h2>
          {answer?.sources.length ? (
            answer.sources.map((source, index) => {
              const citationKey = getCitationKey(source);
              const selected = citationKey === selectedCitationKey;
              return (
                <article className={selected ? 'citation-card selected' : 'citation-card'} data-testid={`citation-card-${source.chunkId}`} key={citationKey}>
                  <button type="button" onClick={() => setSelectedCitationKey(citationKey)}>
                    查看引用 {index + 1}
                  </button>
                  <strong>{source.filename}</strong>
                  <small>
                    chunk {source.chunkId} · 相似度 {(source.score * 100).toFixed(0)}%
                  </small>
                  <p>{source.text}</p>
                </article>
              );
            })
          ) : (
            <p className="table-state">暂无引用。提交问题后会显示 Top-K 检索片段。</p>
          )}
        </aside>
      </div>
    </section>
  );
}
