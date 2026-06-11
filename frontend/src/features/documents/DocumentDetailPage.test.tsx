import { render, screen, waitFor, within } from '@testing-library/react';
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
  updatedBy: '张同学',
};

describe('DocumentDetailPage', () => {
  it('renders processing detail metrics, timestamped dynamic steps, chunks, and vector status', async () => {
    const documentsApi: Pick<DocumentsApi, 'get' | 'chunks' | 'reprocess' | 'downloadUrl'> = {
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
    expect(screen.getByText('rag_documents_v1')).toBeInTheDocument();
    expect(screen.getByText('向量已成功存储并建立索引，可用于检索和问答')).toBeInTheDocument();
  });
});
