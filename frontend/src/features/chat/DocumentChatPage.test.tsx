import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('shows the document upload time even when there is no chat activity yet', async () => {
    const chatApi = createChatApi({
      listDocuments: vi.fn(async () => [
        {
          id: 9,
          originalFilename: '计算机科学与工程学院 推荐优秀应届本科毕业生免试攻读硕士学位研究生工作细则-2026年版本V2.pdf',
          format: 'PDF' as const,
          sizeBytes: 416 * 1024,
          chunkCount: 6,
          vectorCount: 6,
          sessionCount: 0,
          uploadedAt: '2026-06-15T09:48:00+08:00',
          lastActiveAt: null,
        },
      ]),
      listSessions: vi.fn(async () => []),
    });

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={9} />);

    await waitFor(() => expect(chatApi.listSessions).toHaveBeenCalledWith(9));
    expect(screen.getByText(/上传于 2026\/06\/15 09:48/u)).toBeInTheDocument();
    expect(screen.queryByText(/上传于 暂无记录/u)).not.toBeInTheDocument();
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

  it('creates a new conversation and switches history inside the document chat page', async () => {
    const newSession: ChatSessionDetailDto = {
      ...sessionDetail,
      id: 12,
      title: '新对话',
      messages: [],
      createdAt: '2024-05-20T10:30:00+08:00',
      updatedAt: '2024-05-20T10:30:00+08:00',
    };
    const olderSession: ChatSessionDetailDto = {
      ...sessionDetail,
      id: 10,
      title: '历史平均分问答',
      messages: [
        {
          id: 201,
          role: 'USER',
          content: '历史问题',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:10:00+08:00',
          citations: [],
        },
      ],
    };
    const chatApi = createChatApi({
      listSessions: vi.fn(async () => [
        ...sessionSummaries,
        {
          id: 10,
          documentId: 1,
          title: '历史平均分问答',
          status: 'ACTIVE' as const,
          messageCount: 1,
          createdAt: '2024-05-20T10:10:00+08:00',
          updatedAt: '2024-05-20T10:11:00+08:00',
        },
      ]),
      createSession: vi.fn(async () => newSession),
      getSession: vi.fn(async (sessionId) => (sessionId === 10 ? olderSession : sessionDetail)),
    });

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={1} />);

    await screen.findByTestId('assistant-answer-102');
    fireEvent.click(screen.getByRole('button', { name: '新建对话' }));

    await waitFor(() => {
      expect(chatApi.createSession).toHaveBeenCalledWith({ documentId: 1, title: '新对话' });
    });
    expect(await screen.findByText('当前对话暂无消息，可以直接输入问题开始。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '历史对话' }));
    const dialog = await screen.findByRole('dialog', { name: '历史对话' });
    expect(within(dialog).getByText('Transformer 架构详解与注意力机制')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /历史平均分问答/u }));

    await waitFor(() => {
      expect(chatApi.getSession).toHaveBeenCalledWith(10);
    });
    expect(screen.queryByRole('dialog', { name: '历史对话' })).not.toBeInTheDocument();
    expect(screen.getByText('历史问题')).toBeInTheDocument();
  });

  it('follows new messages after sending but stops when the user scrolls the thread', async () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    let streamHandlers: Parameters<ChatApi['streamMessage']>[2] | undefined;
    let resolveStream: (detail: ChatSessionDetailDto) => void = () => undefined;
    const streamingSettings = {
      ...settings,
      llm: {
        ...settings.llm,
        streamOutput: true,
      },
    };
    const streamingSettingsApi = {
      ...settingsApi,
      get: vi.fn(async () => streamingSettings),
    };
    const streamedDetail: ChatSessionDetailDto = {
      ...sessionDetail,
      messages: [
        ...sessionDetail.messages,
        {
          id: 103,
          role: 'USER',
          content: '继续解释',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:00+08:00',
          citations: [],
        },
        {
          id: 104,
          role: 'ASSISTANT',
          content: '流式回答完成。[1]',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:10+08:00',
          citations: [{ ...citation, key: '104:1:110_2', markerIndex: 1, chunkId: '110_2', score: 0.89 }],
        },
      ],
    };
    const chatApi = createChatApi({
      streamMessage: vi.fn((_sessionId, _request, handlers) => {
        streamHandlers = handlers;
        return new Promise<ChatSessionDetailDto>((resolve) => {
          resolveStream = resolve;
        });
      }),
    });

    render(<DocumentChatPage chatApi={chatApi} settingsApi={streamingSettingsApi} initialDocumentId={1} />);

    await screen.findByTestId('assistant-answer-102');
    scrollIntoView.mockClear();
    fireEvent.change(screen.getByLabelText('输入文档问题'), { target: { value: '继续解释' } });
    fireEvent.keyDown(screen.getByLabelText('输入文档问题'), { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(chatApi.streamMessage).toHaveBeenCalledWith(11, { question: '继续解释' }, expect.any(Object));
    });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    scrollIntoView.mockClear();

    fireEvent.wheel(screen.getByLabelText('文档问答消息'));
    await act(async () => {
      streamHandlers?.onChunk?.('用户滚动后追加的内容');
    });
    expect(await screen.findByText(/用户滚动后追加的内容/u)).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();

    await act(async () => {
      resolveStream(streamedDetail);
    });
  });

  it('submits with Enter and inserts a newline with Ctrl+Enter', async () => {
    const nextDetail: ChatSessionDetailDto = {
      ...sessionDetail,
      messages: [
        ...sessionDetail.messages,
        {
          id: 103,
          role: 'USER',
          content: '按回车直接发送',
          status: 'SUCCESS',
          createdAt: '2024-05-20T10:22:00+08:00',
          citations: [],
        },
        {
          id: 104,
          role: 'ASSISTANT',
          content: '已收到。[1]',
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

    const textarea = await screen.findByLabelText('输入文档问题');
    fireEvent.change(textarea, { target: { value: '第一行' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', ctrlKey: true });
    expect(textarea).toHaveValue('第一行\n');
    expect(chatApi.sendMessage).not.toHaveBeenCalled();

    fireEvent.change(textarea, { target: { value: '按回车直接发送' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith(11, {
        question: '按回车直接发送',
      });
    });
  });

  it('clears the composer immediately after sending while the answer is still generating', async () => {
    let resolveMessage: (detail: ChatSessionDetailDto) => void = () => undefined;
    const pendingMessage = new Promise<ChatSessionDetailDto>((resolve) => {
      resolveMessage = resolve;
    });
    const chatApi = createChatApi({
      sendMessage: vi.fn(() => pendingMessage),
    });

    render(<DocumentChatPage chatApi={chatApi} settingsApi={settingsApi} initialDocumentId={1} />);

    const textarea = await screen.findByLabelText('输入文档问题');
    fireEvent.change(textarea, { target: { value: '他怎么计算的' } });
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(chatApi.sendMessage).toHaveBeenCalledWith(11, {
        question: '他怎么计算的',
      });
    });
    expect(textarea).toHaveValue('');

    resolveMessage(sessionDetail);
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
