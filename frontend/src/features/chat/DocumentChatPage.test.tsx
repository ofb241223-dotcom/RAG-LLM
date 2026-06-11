import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentChatPage } from './DocumentChatPage';
import type { ChatApi, ChatSessionDetailDto } from '../../api/chat';
import type { SettingsResponse } from '../../api/settings';
import { chatDocuments, citation, sessionDetail, sessionSummaries } from './chatTestData';

function createChatApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    ask: vi.fn(),
    listDocuments: vi.fn(async () => chatDocuments),
    listSessions: vi.fn(async () => sessionSummaries),
    createSession: vi.fn(async () => sessionDetail),
    getSession: vi.fn(async () => sessionDetail),
    sendMessage: vi.fn(async () => sessionDetail),
    streamMessage: vi.fn(async () => sessionDetail),
    updateSession: vi.fn(async () => sessionDetail),
    deleteSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

const settings: SettingsResponse = {
  llm: {
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    temperature: 0.2,
    maxTokens: 1024,
    topP: 0.9,
    frequencyPenalty: 0,
    contextLength: 128000,
    streamOutput: false,
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
    topK: 7,
    scoreThreshold: 0.3,
    chunkSize: 500,
    chunkOverlap: 80,
    currentDocumentOnly: true,
    showCitations: true,
  },
  updatedAt: '2026-06-10T12:00:00Z',
  updatedBy: '科大人',
};

const settingsApi = {
  get: vi.fn(async () => settings),
  models: vi.fn(),
  save: vi.fn(),
  test: vi.fn(),
};

describe('DocumentChatPage', () => {
  it('renders the dedicated document Q&A workspace with current document and retrieval cards', async () => {
    const chatApi = createChatApi();

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={1} />);

    expect(await screen.findByRole('heading', { name: '文档问答' })).toBeInTheDocument();
    expect(screen.getByText('基于您选择的文档进行智能问答，所有回答均基于文档内容生成，并提供可追溯的引用来源。')).toBeInTheDocument();
    expect(screen.getByText('当前文档（知识库上下文）')).toBeInTheDocument();
    expect(screen.getAllByText('《深度学习原理与实践》第3版.pdf').length).toBeGreaterThan(0);
    expect(screen.getByTestId('current-document-file-icon')).toBeInTheDocument();
    expect(screen.getByText('模型')).toBeInTheDocument();
    expect(await screen.findByText('gemini-3.1-flash-lite')).toBeInTheDocument();
    expect(screen.getByText('嵌入模型')).toBeInTheDocument();
    expect(screen.getByText('gemini-embedding-001')).toBeInTheDocument();
    expect(screen.getByText('检索 Top-K')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();

    const citationPanel = screen.getByLabelText('引用片段列表');
    expect(within(citationPanel).getByText('引用片段 [1]')).toBeInTheDocument();
    expect(within(citationPanel).getByText('相似度 92% · score 0.92')).toBeInTheDocument();
    expect(within(citationPanel).queryByText('3.2 多头注意力机制')).not.toBeInTheDocument();
  });

  it('renders assistant markdown and LaTeX, then sends follow-up questions with topK', async () => {
    const nextDetail: ChatSessionDetailDto = {
      ...sessionDetail,
      messages: [
        ...sessionDetail.messages,
        {
          id: 103,
          role: 'USER',
          content: '位置编码具体是如何计算的？',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:00+08:00',
          citations: [],
        },
        {
          id: 104,
          role: 'ASSISTANT',
          content: '位置编码使用正弦和余弦函数表示：$PE(pos,2i)=\\sin(pos/10000^{2i/d})$。[1]',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:10+08:00',
          citations: [{ ...citation, key: '104:1:110_2', markerIndex: 1, chunkId: '110_2', score: 0.89 }],
        },
      ],
    };
    const chatApi = createChatApi({
      sendMessage: vi.fn(async () => nextDetail),
    });

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={1} />);

    const assistantAnswer = await screen.findByTestId('assistant-answer-102');
    expect(within(assistantAnswer).getByText('多头注意力（Multi-Head Self-Attention）')).toBeInTheDocument();
    expect(assistantAnswer.querySelector('.katex')).not.toBeNull();
    expect(assistantAnswer.textContent).toContain('QK^T');

    fireEvent.change(screen.getByLabelText('输入文档问题'), {
      target: { value: '位置编码具体是如何计算的？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith(11, {
        question: '位置编码具体是如何计算的？',
      });
    });
    const nextAnswer = await screen.findByTestId('assistant-answer-104');
    expect(nextAnswer.textContent).toContain('位置编码使用正弦和余弦函数表示');
    expect(nextAnswer.querySelector('.katex')).not.toBeNull();
  });

  it('shows citations for the latest answer by default and switches when an older marker is clicked', async () => {
    const olderCitation = {
      ...citation,
      key: '102:1:98_3',
      markerIndex: 1,
      chunkId: '98_3',
      score: 0.92,
      text: '旧回答的完整引用片段，来自第一轮问题。',
    };
    const latestCitation = {
      ...citation,
      key: '104:1:110_2',
      markerIndex: 1,
      chunkId: '110_2',
      score: 0.83,
      text: '最新回答的引用片段，应该默认显示在右侧。',
    };
    const secondLatestCitation = {
      ...citation,
      key: '104:1:111_3',
      markerIndex: 2,
      chunkId: '111_3',
      score: 0.81,
      text: '最新回答的第二个引用片段，应该显示为 [2]。',
    };
    const multiTurnDetail: ChatSessionDetailDto = {
      ...sessionDetail,
      messages: [
        {
          id: 101,
          role: 'USER',
          content: '第一轮问题',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:21:00+08:00',
          citations: [],
        },
        {
          id: 102,
          role: 'ASSISTANT',
          content: '第一轮回答。[1]',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:21:10+08:00',
          citations: [olderCitation],
        },
        {
          id: 103,
          role: 'USER',
          content: '第二轮问题',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:00+08:00',
          citations: [],
        },
        {
          id: 104,
          role: 'ASSISTANT',
          content: '第二轮回答。[1]',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:10+08:00',
          citations: [latestCitation, secondLatestCitation],
        },
      ],
    };
    const chatApi = createChatApi({
      getSession: vi.fn(async () => multiTurnDetail),
    });

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={1} />);

    const citationPanel = await screen.findByLabelText('引用片段列表');
    expect(within(citationPanel).getByText('最新回答的引用片段，应该默认显示在右侧。')).toBeInTheDocument();
    expect(within(citationPanel).getByText('引用片段 [1]')).toBeInTheDocument();
    expect(within(citationPanel).getByText('引用片段 [2]')).toBeInTheDocument();
    expect(within(citationPanel).queryByText('旧回答的完整引用片段，来自第一轮问题。')).not.toBeInTheDocument();

    const olderAnswer = await screen.findByTestId('assistant-answer-102');
    fireEvent.click(within(olderAnswer).getByRole('button', { name: '引用 1' }));

    expect(within(citationPanel).getByText('旧回答的完整引用片段，来自第一轮问题。')).toBeInTheDocument();
    expect(within(citationPanel).getByText('引用片段 [1]')).toBeInTheDocument();
    expect(within(citationPanel).queryByText('引用片段 [2]')).not.toBeInTheDocument();
    expect(within(citationPanel).queryByText('最新回答的引用片段，应该默认显示在右侧。')).not.toBeInTheDocument();
  });

  it('opens the full citation text in a dialog when a citation card is clicked', async () => {
    const chatApi = createChatApi();

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={1} />);

    const citationPanel = await screen.findByLabelText('引用片段列表');
    fireEvent.click(within(citationPanel).getByRole('button', { name: /引用片段 \[1\]/u }));

    const dialog = await screen.findByRole('dialog', { name: '引用片段 [1]' });
    expect(within(dialog).getByText('相似度 92% · score 0.92 · 第 98 页 · Chunk: 98_3')).toBeInTheDocument();
    expect(within(dialog).getByText('多头注意力允许模型在不同表示子空间中关注输入序列的不同位置。')).toBeInTheDocument();
  });
});
