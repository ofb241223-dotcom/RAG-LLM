import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentDetailPage } from './DocumentDetailPage';
import type { DocumentsApi } from '../../api/documents';
import type { SettingsResponse } from '../../api/settings';
import type { DocumentDto } from '../../types/document';

const readyDocument: DocumentDto = {
  id: 101,
  originalFilename: '《深度学习原理与实践》第3章.pdf',
  format: 'PDF',
  source: 'MANUAL_UPLOAD',
  status: 'READY',
  sizeBytes: 12.4 * 1024 * 1024,
  uploadedAt: '2024-05-20T14:32:21+08:00',
  updatedAt: '2024-05-20T14:33:05+08:00',
  chunkCount: 1,
  vectorCount: 1,
};

const settings: SettingsResponse = {
  llm: {
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    temperature: 0.2,
    maxTokens: 1024,
    topP: 0.9,
    frequencyPenalty: 0,
    contextLength: 128000,
    streamOutput: true,
    systemPrompt: '只基于文档回答。',
  },
  embedding: {
    provider: 'google',
    model: 'gemini-embedding-001',
    batchSize: 10,
    reprocessRequiredCount: 0,
  },
  vectorStore: {
    type: 'chroma',
    collectionName: 'rag_documents_v1',
    persistDir: './rag_data/chroma',
  },
  rag: {
    topK: 3,
    scoreThreshold: 0.25,
    chunkSize: 900,
    chunkOverlap: 120,
    currentDocumentOnly: true,
    showCitations: true,
  },
  updatedAt: '2024-05-20T14:33:05+08:00',
  updatedBy: '科大人',
};

const readySteps = [
  { id: 1, key: 'upload', label: '文件上传', detail: '文件上传成功', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:32:21+08:00' },
  { id: 2, key: 'extract', label: '文本提取', detail: '已提取 13 个字符', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:32:25+08:00' },
  { id: 3, key: 'split', label: '文本分块', detail: '已生成 1 个文本块', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:32:30+08:00' },
  { id: 4, key: 'vector', label: '向量化处理', detail: '已生成 1 个向量', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:32:48+08:00' },
  { id: 5, key: 'index', label: '索引构建', detail: '索引构建完成', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:33:02+08:00' },
  { id: 6, key: 'stored', label: '存储完成', detail: '向量已存储并可检索', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:33:05+08:00' },
];

describe('DocumentDetailPage', () => {
  it('renders processing detail metrics, timestamped dynamic steps, chunks, and vector status', async () => {
    const documentsApi: Pick<DocumentsApi, 'get' | 'chunks' | 'processing' | 'reprocess' | 'downloadUrl'> = {
      get: vi.fn(async () => readyDocument),
      chunks: vi.fn(async () => [
        {
          document_id: '101',
          chunk_id: '101-0',
          source_name: '《深度学习原理与实践》第3章.pdf',
          format: 'PDF',
          chunk_index: 0,
          text: '真实文本块内容来自 RAG 服务。',
          page: 3,
        },
      ]),
      processing: vi.fn(async () => readySteps),
      reprocess: vi.fn(async () => readyDocument),
      downloadUrl: vi.fn((id) => `/api/documents/${id}/download`),
    };
    const mockSettingsApi = {
      get: vi.fn(async () => settings),
    };

    render(
      <DocumentDetailPage
        documentId={101}
        documentsApi={documentsApi}
        settingsApi={mockSettingsApi}
        onAskDocument={() => undefined}
        onBack={() => undefined}
      />,
    );

    expect(screen.getByText('正在加载处理详情...')).toBeInTheDocument();
    await waitFor(() => expect(documentsApi.get).toHaveBeenCalledWith(101));

    expect(screen.getByRole('heading', { name: '文档处理详情' })).toBeInTheDocument();
    expect(screen.getByText('《深度学习原理与实践》第3章.pdf')).toBeInTheDocument();
    expect(screen.getByText('12.4 MB')).toBeInTheDocument();
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getByText('3,072')).toBeInTheDocument();

    const flow = screen.getByRole('list', { name: '文档处理流程' });
    expect(within(flow).getAllByRole('listitem')).toHaveLength(6);
    expect(within(flow).getByText('文件上传')).toBeInTheDocument();
    expect(within(flow).getByText('文本提取')).toBeInTheDocument();
    expect(within(flow).getByText('文本分块')).toBeInTheDocument();
    expect(within(flow).getByText('向量化处理')).toBeInTheDocument();
    expect(within(flow).getByText('索引构建')).toBeInTheDocument();
    expect(within(flow).getByText('存储完成')).toBeInTheDocument();
    expect(within(flow).getByText('14:32:21')).toBeInTheDocument();
    expect(within(flow).getByText('14:33:05')).toBeInTheDocument();
    expect(flow.querySelectorAll('.complete')).toHaveLength(6);

    expect(screen.getByText('文本分块预览')).toBeInTheDocument();
    expect(screen.getByText('101-0')).toBeInTheDocument();
    expect(screen.getByText('真实文本块内容来自 RAG 服务。')).toBeInTheDocument();
    expect(screen.getByText('gemini-embedding-001')).toBeInTheDocument();
    expect(screen.getByText('Chroma')).toBeInTheDocument();
    expect(screen.getByText('rag_documents_v1__google_gemini-embedding-001')).toBeInTheDocument();
    expect(screen.getByText('向量已成功存储并建立索引，可用于检索和问答')).toBeInTheDocument();
  });

  it('shows the OpenRouter text-embedding-3-small vector dimension accurately', async () => {
    const openRouterSettings: SettingsResponse = {
      ...settings,
      embedding: {
        ...settings.embedding,
        provider: 'openrouter',
        model: 'openai/text-embedding-3-small',
      },
    };
    const documentsApi: Pick<DocumentsApi, 'get' | 'chunks' | 'processing' | 'reprocess' | 'downloadUrl'> = {
      get: vi.fn(async () => readyDocument),
      chunks: vi.fn(async () => []),
      processing: vi.fn(async () => readySteps),
      reprocess: vi.fn(async () => readyDocument),
      downloadUrl: vi.fn((id) => `/api/documents/${id}/download`),
    };
    const mockSettingsApi = {
      get: vi.fn(async () => openRouterSettings),
    };

    render(
      <DocumentDetailPage
        documentId={101}
        documentsApi={documentsApi}
        settingsApi={mockSettingsApi}
        onAskDocument={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(documentsApi.get).toHaveBeenCalledWith(101));

    expect(screen.getByText('1,536')).toBeInTheDocument();
    expect(screen.getByText('rag_documents_v1__openrouter_openai_text-embedding-3-small')).toBeInTheDocument();
  });

  it('does not render the ask button when processing failed', async () => {
    const failedDocument: DocumentDto = {
      ...readyDocument,
      status: 'FAILED',
      errorMessage: 'Document contains no extractable text.',
      chunkCount: null,
      vectorCount: null,
    };
    const documentsApi: Pick<DocumentsApi, 'get' | 'chunks' | 'processing' | 'reprocess' | 'downloadUrl'> = {
      get: vi.fn(async () => failedDocument),
      chunks: vi.fn(async () => []),
      processing: vi.fn(async () => [
        readySteps[0],
        { id: 2, key: 'extract', label: '文本提取', detail: 'Document contains no extractable text.', state: 'FAILED' as const, occurredAt: '2024-05-20T14:33:05+08:00' },
      ]),
      reprocess: vi.fn(async () => failedDocument),
      downloadUrl: vi.fn((id) => `/api/documents/${id}/download`),
    };
    const mockSettingsApi = {
      get: vi.fn(async () => settings),
    };

    render(
      <DocumentDetailPage
        documentId={101}
        documentsApi={documentsApi}
        settingsApi={mockSettingsApi}
        onAskDocument={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(documentsApi.get).toHaveBeenCalledWith(101));

    expect(screen.getByText('处理失败')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '去文档问答' })).not.toBeInTheDocument();
  });

  it('shows live backend processing steps immediately after reprocess starts', async () => {
    const parsingDocument: DocumentDto = {
      ...readyDocument,
      status: 'PARSING',
      updatedAt: '2024-05-20T14:40:00+08:00',
    };
    const activeSteps = [
      { id: 1, key: 'upload', label: '文件上传', detail: '文件上传成功', state: 'COMPLETE' as const, occurredAt: '2024-05-20T14:32:21+08:00' },
      { id: 2, key: 'extract', label: '文本提取', detail: '等待提取文本内容', state: 'ACTIVE' as const, occurredAt: '2024-05-20T14:40:00+08:00' },
      { id: 3, key: 'split', label: '文本分块', detail: '等待文本分块', state: 'PENDING' as const, occurredAt: null },
    ];
    const documentsApi: Pick<DocumentsApi, 'get' | 'chunks' | 'processing' | 'reprocess' | 'downloadUrl'> = {
      get: vi.fn(async () => readyDocument),
      chunks: vi.fn(async () => []),
      processing: vi.fn()
        .mockResolvedValueOnce(readySteps)
        .mockResolvedValueOnce(activeSteps),
      reprocess: vi.fn(async () => parsingDocument),
      downloadUrl: vi.fn((id) => `/api/documents/${id}/download`),
    };

    render(
      <DocumentDetailPage
        documentId={101}
        documentsApi={documentsApi}
        settingsApi={{ get: vi.fn(async () => settings) }}
        onAskDocument={() => undefined}
        onBack={() => undefined}
      />,
    );

    await waitFor(() => expect(documentsApi.processing).toHaveBeenCalledWith(101));
    fireEvent.click(screen.getByRole('button', { name: /重新处理/ }));

    await waitFor(() => expect(screen.getByText('等待提取文本内容')).toBeInTheDocument());
    const flow = screen.getByRole('list', { name: '文档处理流程' });
    expect(flow.querySelectorAll('.active')).toHaveLength(1);
    expect(screen.getByText('文档正在解析、分块或向量化，请稍候')).toBeInTheDocument();
  });
});
