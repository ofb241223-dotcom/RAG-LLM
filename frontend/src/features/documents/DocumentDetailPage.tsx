import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Box,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileText,
  Layers,
  MessageCircle,
  RefreshCw,
  SearchCheck,
  Sigma,
  type LucideIcon,
} from 'lucide-react';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import { settingsApi as defaultSettingsApi, type SettingsResponse } from '../../api/settings';
import type { DocumentChunkDto, DocumentDto, DocumentProcessingStepDto } from '../../types/document';
import { formatBytes, formatDateTime } from '../../utils/format';
import { getStatusClass, getStatusLabel, isTerminalStatus } from './status';

type DetailApi = Pick<DocumentsApi, 'get' | 'chunks' | 'processing' | 'reprocess' | 'downloadUrl'>;

interface DocumentDetailPageProps {
  documentId: number;
  documentsApi?: DetailApi;
  settingsApi?: Pick<typeof defaultSettingsApi, 'get'>;
  initialDocument?: DocumentDto;
  onAskDocument: (document: DocumentDto) => void;
  onBack: () => void;
}

interface DetailStep {
  key: string;
  label: string;
  detail: string;
  time: string;
  occurredAt?: string | null;
  icon: LucideIcon;
  state: 'complete' | 'active' | 'pending' | 'failed';
}

interface ExtractStat {
  label: string;
  value: string;
  unit: string;
  icon: LucideIcon;
}

interface PreviewChunk {
  id: string;
  text: string;
  characters: number;
  tokens: number;
  overlap: number;
}

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(date);
}

function getFileTone(format: DocumentDto['format']): string {
  if (format === 'PDF') return 'pdf';
  if (format === 'TXT') return 'txt';
  if (format === 'XLSX' || format === 'XLS') return 'excel';
  return 'word';
}

function estimateCharacterCount(document: DocumentDto): number {
  if (document.chunkCount && document.chunkCount > 0) {
    return document.chunkCount * 2007 + 46;
  }
  return Math.max(1200, Math.round(document.sizeBytes / 6));
}

function getDisplayChunkCount(document: DocumentDto): number {
  if (document.chunkCount !== null && document.chunkCount !== undefined) return document.chunkCount;
  return 0;
}

function getDisplayVectorCount(document: DocumentDto): number {
  if (document.vectorCount !== null && document.vectorCount !== undefined) return document.vectorCount;
  return document.status === 'READY' ? getDisplayChunkCount(document) : 0;
}

const stepIcons: Record<string, LucideIcon> = {
  upload: FileText,
  extract: FileText,
  split: Layers,
  vector: Box,
  index: SearchCheck,
  stored: Database,
};

function mapProcessingSteps(steps: DocumentProcessingStepDto[]): DetailStep[] {
  return steps.map((step) => ({
    key: step.key,
    label: step.label,
    detail: step.detail,
    time: step.occurredAt ? formatClock(new Date(step.occurredAt)) : '-',
    occurredAt: step.occurredAt,
    icon: stepIcons[step.key] ?? FileText,
    state: step.state.toLowerCase() as DetailStep['state'],
  }));
}

function buildFallbackSteps(document: DocumentDto): DetailStep[] {
  const definitions = [
    { key: 'upload', label: '文件上传', detail: '文件上传成功', pendingDetail: '等待文件上传', icon: FileText },
    { key: 'extract', label: '文本提取', detail: '已完成', pendingDetail: '等待提取文本内容', icon: FileText },
    { key: 'split', label: '文本分块', detail: '已完成', pendingDetail: '等待文本分块', icon: Layers },
    { key: 'vector', label: '向量化处理', detail: '已完成', pendingDetail: '等待生成向量', icon: Box },
    { key: 'index', label: '索引构建', detail: '索引构建完成', pendingDetail: '等待索引构建', icon: SearchCheck },
    { key: 'stored', label: '存储完成', detail: '向量已存储并可检索', pendingDetail: '等待存储完成', icon: Database },
  ];
  const activeKey = document.status === 'EMBEDDING' ? 'vector' : document.status === 'PARSING' ? 'extract' : 'upload';
  const activeIndex = definitions.findIndex((step) => step.key === activeKey);
  const failedIndex = document.status === 'FAILED' ? Math.max(activeIndex, 1) : -1;

  return definitions.map((step, index) => {
    const isReady = document.status === 'READY';
    const isFailed = failedIndex === index;
    const isComplete = isReady || (failedIndex >= 0 ? index < failedIndex : index < activeIndex);
    const isActive = !isReady && failedIndex < 0 && index === activeIndex;
    const occurredAt = index === 0 ? document.uploadedAt : isReady || isFailed ? document.updatedAt : undefined;
    return {
      key: step.key,
      label: step.label,
      detail: isFailed ? document.errorMessage ?? '处理失败' : isComplete ? step.detail : isActive ? getStatusLabel(document.status) : step.pendingDetail,
      time: occurredAt ? formatClock(new Date(occurredAt)) : '-',
      occurredAt,
      icon: step.icon,
      state: isFailed ? 'failed' : isComplete ? 'complete' : isActive ? 'active' : 'pending',
    };
  });
}

function processingDuration(document: DocumentDto, steps: DetailStep[]): string {
  if (!isTerminalStatus(document.status) || document.status === 'REPROCESS_REQUIRED') {
    return '-';
  }
  const startAt = processingStartedAt(document, steps);
  const finishedStep = [...steps].reverse().find((step) => step.state === 'complete' && step.occurredAt);
  const end = new Date(finishedStep?.occurredAt ?? document.updatedAt).getTime();
  const start = startAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return '-';
  }
  return `${Math.max(1, Math.round((end - start) / 1000))} 秒`;
}

function processingStartedAt(document: DocumentDto, steps: DetailStep[]): Date {
  const firstProcessingStep = steps.find((step) => step.key !== 'upload' && step.occurredAt);
  if (firstProcessingStep) {
    return new Date(firstProcessingStep.occurredAt!);
  }
  const uploadStep = steps.find((step) => step.key === 'upload' && step.occurredAt);
  return new Date(uploadStep?.occurredAt ?? document.uploadedAt);
}

function chunkId(chunk: DocumentChunkDto): string {
  return chunk.chunk_id ?? chunk.chunkId ?? `chunk_${String(chunk.chunk_index ?? chunk.chunkIndex ?? 0).padStart(4, '0')}`;
}

function chunkIndex(chunk: DocumentChunkDto): number {
  return chunk.chunk_index ?? chunk.chunkIndex ?? 0;
}

function buildPreviewChunks(chunks: DocumentChunkDto[], overlap: number): PreviewChunk[] {
  return [...chunks]
    .sort((left, right) => chunkIndex(left) - chunkIndex(right))
    .map((chunk) => ({
      id: chunkId(chunk),
      text: chunk.text,
      characters: chunk.text.length,
      tokens: Math.max(1, Math.ceil(chunk.text.length / 4)),
      overlap,
    }));
}

function providerLabel(provider?: string): string {
  if (provider === 'google') return 'Google AI Studio';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'dashscope') return '通义千问';
  return provider || '未配置';
}

function vectorStoreLabel(type?: string): string {
  if (!type) return '未配置';
  if (type.toLowerCase() === 'chroma') return 'Chroma';
  return type;
}

function inferEmbeddingDimension(model?: string): number | null {
  if (!model) return null;
  if (model.includes('text-embedding-3-small')) return 1536;
  if (model.includes('text-embedding-3-large')) return 3072;
  if (model.includes('gemini-embedding')) return 3072;
  if (model.includes('llama-nemotron-embed')) return 2048;
  if (model.includes('text-embedding-v4')) return 2048;
  return null;
}

function runtimeCollectionName(baseName: string, provider?: string, model?: string): string {
  const namespace = `${provider ?? ''}_${model ?? ''}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return namespace ? `${baseName}__${namespace}` : baseName;
}

function buildKeywords(document: DocumentDto, chunks: PreviewChunk[]): string[] {
  const text = `${document.originalFilename} ${chunks.slice(0, 3).map((chunk) => chunk.text).join(' ')}`;
  const words = text
    .replace(/[^\p{Script=Han}a-zA-Z0-9]+/gu, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !['PDF', 'TXT', 'DOCX', 'DOC', 'XLSX', 'XLS'].includes(word.toUpperCase()));
  return Array.from(new Set(words)).slice(0, 5);
}

export function DocumentDetailPage({
  documentId,
  documentsApi = defaultDocumentsApi,
  settingsApi = defaultSettingsApi,
  initialDocument,
  onAskDocument,
  onBack,
}: DocumentDetailPageProps) {
  const [document, setDocument] = useState<DocumentDto | undefined>(initialDocument);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [documentChunks, setDocumentChunks] = useState<DocumentChunkDto[]>([]);
  const [processingSteps, setProcessingSteps] = useState<DocumentProcessingStepDto[]>([]);
  const [loading, setLoading] = useState(!initialDocument);
  const [error, setError] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [showAllChunks, setShowAllChunks] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(!initialDocument);
    setError(undefined);

    Promise.allSettled([documentsApi.get(documentId), documentsApi.processing(documentId), documentsApi.chunks(documentId), settingsApi.get()])
      .then(([documentResult, stepsResult, chunksResult, settingsResult]) => {
        if (!mounted) return;

        if (documentResult.status === 'fulfilled') {
          setDocument(documentResult.value);
        } else if (!initialDocument) {
            setError(documentResult.reason instanceof Error ? documentResult.reason.message : '文档处理详情加载失败');
        }

        if (stepsResult.status === 'fulfilled') {
          setProcessingSteps(stepsResult.value);
        } else {
          setProcessingSteps([]);
        }

        if (chunksResult.status === 'fulfilled') {
          setDocumentChunks(chunksResult.value);
        } else {
          setDocumentChunks([]);
        }

        if (settingsResult.status === 'fulfilled') {
          setSettings(settingsResult.value);
        } else {
          setSettings(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [documentId, documentsApi, initialDocument, settingsApi]);

  useEffect(() => {
    if (!document || isTerminalStatus(document.status)) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const [nextDocument, nextSteps] = await Promise.all([
          documentsApi.get(documentId),
          documentsApi.processing(documentId),
        ]);
        if (cancelled) return;
        setDocument(nextDocument);
        setProcessingSteps(nextSteps);
        if (nextDocument.status === 'READY') {
          documentsApi.chunks(documentId)
            .then((chunks) => {
              if (!cancelled) setDocumentChunks(chunks);
            })
            .catch(() => {
              if (!cancelled) setDocumentChunks([]);
            });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '处理进度刷新失败');
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [document, documentId, documentsApi]);

  const detail = useMemo(() => {
    if (!document) return null;
    const chunks = buildPreviewChunks(documentChunks, settings?.rag.chunkOverlap ?? 0);
    const chunkCount = chunks.length || getDisplayChunkCount(document);
    const vectorCount = document.vectorCount ?? chunkCount;
    const isIndexed = document.status === 'READY';
    const characters = chunks.length > 0
      ? chunks.reduce((total, chunk) => total + chunk.characters, 0)
      : estimateCharacterCount(document);
    const vectorDimension = inferEmbeddingDimension(settings?.embedding.model);

    return {
      characters,
      chunkCount,
      vectorCount,
      chunks,
      steps: processingSteps.length > 0 ? mapProcessingSteps(processingSteps) : buildFallbackSteps(document),
      vectorDimension,
      tableCount: 0,
      imageCount: 0,
      formulaCount: 0,
      isIndexed,
      keywords: buildKeywords(document, chunks),
    };
  }, [document, documentChunks, processingSteps, settings?.embedding.model, settings?.rag.chunkOverlap]);

  const handleReprocess = async () => {
    if (!document) return;
    setRefreshing(true);
    setError(undefined);
    try {
      const nextDocument = await documentsApi.reprocess(document.id);
      setDocument(nextDocument);
      setProcessingSteps(await documentsApi.processing(document.id));
      if (nextDocument.status === 'READY') {
        setDocumentChunks(await documentsApi.chunks(document.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新处理失败');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && !document) {
    return (
      <section className="feature-page document-detail-page">
        <div className="detail-loading-state">正在加载处理详情...</div>
      </section>
    );
  }

  if (!document || !detail) {
    return (
      <section className="feature-page document-detail-page">
        <div className="detail-loading-state error-state">
          <span>{error ?? '文档处理详情加载失败'}</span>
          <button className="secondary-button" type="button" onClick={onBack}>
            <ArrowLeft size={15} />
            返回
          </button>
        </div>
      </section>
    );
  }

  const steps = detail.steps;
  const startedAt = processingStartedAt(document, steps);
  const duration = processingDuration(document, steps);
  const embeddingModel = settings?.embedding.model ?? '未读取';
  const embeddingProvider = providerLabel(settings?.embedding.provider);
  const vectorStoreType = vectorStoreLabel(settings?.vectorStore.type);
  const vectorCollection = runtimeCollectionName(
    settings?.vectorStore.collectionName ?? 'rag_documents_v1',
    settings?.embedding.provider,
    settings?.embedding.model,
  );
  const averageVectorSize = detail.vectorDimension ? `${(detail.vectorDimension * 4 / 1024).toFixed(1)} KB` : '-';
  const previewChunks = detail.chunks.slice(0, 4);
  const extractStats: ExtractStat[] = [
    { label: '提取字符数', value: detail.characters.toLocaleString('zh-CN'), unit: '字符', icon: FileText },
    { label: '提取段落数', value: detail.chunkCount.toLocaleString('zh-CN'), unit: '段落', icon: Layers },
    { label: '提取表格数', value: String(detail.tableCount), unit: '表格', icon: Database },
    { label: '提取图片数', value: String(detail.imageCount), unit: '图片', icon: Eye },
    { label: '提取公式数', value: String(detail.formulaCount), unit: '公式', icon: Sigma },
  ];

  return (
    <section className="feature-page document-detail-page">
      <div className="page-heading document-detail-heading">
        <div>
          <span className="detail-breadcrumb">上传文档 / 文档处理详情</span>
          <h1>文档处理详情</h1>
          <p>查看文档处理的详细结果与各阶段状态</p>
        </div>
        <div className="detail-heading-actions">
          <a className="secondary-button" href={documentsApi.downloadUrl(document.id)} download>
            <Download size={16} />
            下载原文档
          </a>
          <button className="secondary-button" disabled={refreshing} type="button" onClick={handleReprocess}>
            <RefreshCw size={16} />
            重新处理
          </button>
          <button className="secondary-button" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            返回
          </button>
        </div>
      </div>

      <div className="document-detail-grid">
        <article className="detail-card detail-summary-card">
          <div className="detail-file-badge">
            <i className={`detail-file-icon ${getFileTone(document.format)}`}>{document.format}</i>
          </div>
          <div className="detail-summary-main">
            <div>
              <h2>{document.originalFilename}</h2>
              <mark className={`status-badge ${getStatusClass(document.status)}`}>{getStatusLabel(document.status)}</mark>
            </div>
            <dl>
              <div>
                <dt>文件类型</dt>
                <dd>{document.format}</dd>
              </div>
              <div>
                <dt>文件大小</dt>
                <dd>{formatBytes(document.sizeBytes)}</dd>
              </div>
              <div>
                <dt>Chunk 数</dt>
                <dd>{detail.chunkCount.toLocaleString('zh-CN')}</dd>
              </div>
              <div>
                <dt>处理开始时间</dt>
                <dd>{formatDateTime(startedAt.toISOString())}</dd>
              </div>
              <div>
                <dt>处理完成时间</dt>
                <dd>{formatDateTime(document.updatedAt)}</dd>
              </div>
              <div>
                <dt>处理耗时</dt>
                <dd>{duration}</dd>
              </div>
            </dl>
          </div>
        </article>

        <div className="detail-left-stack">
          <article className="detail-card detail-extract-card">
            <header>
              <h2>文本提取结果</h2>
            </header>
            <div className="extract-stat-row">
              {extractStats.map(({ label, value, unit, icon: Icon }) => (
                <div className="extract-stat" key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                  <span>{unit}</span>
                  <Icon aria-hidden="true" size={18} />
                </div>
              ))}
            </div>
          </article>

          <article className="detail-card detail-chunks-card">
            <header>
              <h2>文本分块预览</h2>
              <span>共生成 {detail.chunkCount.toLocaleString('zh-CN')} 个文本块</span>
            </header>
            <div className="detail-chunk-table">
              <div className="detail-chunk-row header">
                <span>Chunk ID</span>
                <span>文本内容预览</span>
                <span>字符数</span>
                <span>Token 数</span>
                <span>重叠字符</span>
              </div>
              {detail.chunks.length > 0 ? (
                previewChunks.map((chunk) => (
                  <div className="detail-chunk-row" key={chunk.id}>
                    <span className="chunk-id">{chunk.id}</span>
                    <span className="chunk-preview-text">{chunk.text}</span>
                    <span>{chunk.characters.toLocaleString('zh-CN')}</span>
                    <span>{chunk.tokens}</span>
                    <span>{chunk.overlap}</span>
                  </div>
                ))
              ) : (
                <div className="detail-chunk-empty">
                  <strong>暂无可预览文本块</strong>
                  <small>索引构建成功后会显示 Chunk 内容、字符数和 Token 估算。</small>
                </div>
              )}
            </div>
            <button className="detail-view-all-button" disabled={detail.chunks.length === 0} type="button" onClick={() => setShowAllChunks(true)}>
              查看全部 {detail.chunks.length.toLocaleString('zh-CN')} 个文本块
            </button>
          </article>
        </div>

        <div className="detail-middle-stack">
          <article className="detail-card detail-vector-card">
            <header>
              <h2>向量化信息</h2>
            </header>
            <div className="vector-info-grid">
              <div>
                <small>嵌入模型</small>
                <strong>{embeddingModel}</strong>
                <span>{embeddingProvider}</span>
              </div>
              <div>
                <small>向量维度</small>
                <strong>{detail.vectorDimension ? detail.vectorDimension.toLocaleString('zh-CN') : '自动'}</strong>
                <span>维度</span>
              </div>
              <div>
                <small>向量总数</small>
                <strong>{detail.vectorCount.toLocaleString('zh-CN')}</strong>
                <span>个</span>
              </div>
              <div>
                <small>平均向量大小</small>
                <strong>{averageVectorSize}</strong>
                <span>每个向量</span>
              </div>
            </div>
            <div className="keyword-cloud" aria-label="前 5 个关键词">
              {(detail.keywords.length > 0 ? detail.keywords : ['暂无关键词']).map((keyword) => (
                <span key={keyword}>{keyword}</span>
              ))}
            </div>
          </article>

          <article className="detail-card detail-index-card">
            <header>
              <h2>索引存储状态</h2>
            </header>
            <dl>
              <div>
                <dt>索引名称</dt>
                <dd>{`${vectorCollection}/${document.id}`}</dd>
              </div>
              <div>
                <dt>存储状态</dt>
                <dd>
                  <mark className={`status-badge ${detail.isIndexed ? 'ready' : getStatusClass(document.status)}`}>
                    {detail.isIndexed ? '已存储' : document.status === 'FAILED' ? '存储失败' : '待存储'}
                  </mark>
                </dd>
              </div>
              <div>
                <dt>向量数据库</dt>
                <dd>{vectorStoreType}</dd>
              </div>
              <div>
                <dt>集合名称</dt>
                <dd>{vectorCollection}</dd>
              </div>
              <div>
                <dt>存储向量数</dt>
                <dd>{detail.vectorCount.toLocaleString('zh-CN')}</dd>
              </div>
              <div>
                <dt>存储时间</dt>
                <dd>{detail.isIndexed ? formatDateTime(document.updatedAt) : '-'}</dd>
              </div>
            </dl>
            <p className={detail.isIndexed ? undefined : 'pending'}>
              <CheckCircle2 size={16} />
              {detail.isIndexed ? '向量已成功存储并建立索引，可用于检索和问答' : '向量索引尚未完成，完成后可用于检索和问答'}
            </p>
          </article>
        </div>

        <article className="detail-card detail-timeline-card">
          <header>
            <h2>处理流程</h2>
          </header>
          <ol aria-label="文档处理流程" className={`detail-timeline ${document.status.toLowerCase()}`}>
            {steps.map(({ key, label, detail: stepDetail, time, icon: Icon, state }) => (
              <li className={state} key={key}>
                <span className="detail-step-check">
                  <CheckCircle2 size={16} />
                </span>
                <span className="detail-step-icon">
                  <Icon size={18} />
                </span>
                <span className="detail-step-copy">
                  <strong>{label}</strong>
                  <small>{stepDetail}</small>
                </span>
                <time>{time}</time>
              </li>
            ))}
          </ol>
          <div className={`detail-complete-card ${document.status.toLowerCase()}`}>
            <CheckCircle2 size={32} />
            <div>
              <strong>{document.status === 'READY' ? '处理完成' : document.status === 'FAILED' ? '处理失败' : '处理中'}</strong>
              <span>
                {document.status === 'READY'
                  ? '文档已成功处理，可用于问答'
                  : document.status === 'FAILED'
                    ? document.errorMessage ?? '处理过程出现错误'
                    : '文档正在解析、分块或向量化，请稍候'}
              </span>
              {document.status === 'READY' ? (
                <button className="primary-button" type="button" onClick={() => onAskDocument(document)}>
                  <MessageCircle size={16} />
                  去文档问答
                </button>
              ) : null}
            </div>
          </div>
        </article>
      </div>

      {error ? (
        <p className="inline-error document-detail-error" role="alert">
          {error}
        </p>
      ) : null}

      {showAllChunks ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="all-chunks-title" aria-modal="true" className="confirm-dialog wide-dialog" role="dialog">
            <div className="confirm-dialog-content">
              <h2 id="all-chunks-title">文本块预览</h2>
              <p>按 Chunk ID 查看文本内容和统计信息。</p>
              <div className="detail-chunk-dialog-list">
                {detail.chunks.map((chunk) => (
                  <article key={chunk.id}>
                    <strong>{chunk.id}</strong>
                    <span>{chunk.text}</span>
                    <small>
                      {chunk.characters.toLocaleString('zh-CN')} 字符 · {chunk.tokens} tokens · 重叠 {chunk.overlap}
                    </small>
                  </article>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button className="primary-button" type="button" onClick={() => setShowAllChunks(false)}>
                关闭
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
