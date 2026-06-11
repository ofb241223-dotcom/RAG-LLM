import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatHistoryPage } from './ChatHistoryPage';
import type { ChatApi, ChatSessionDetailDto } from '../../api/chat';
import { chatDocuments, sessionDetail, sessionSummaries } from './chatTestData';

function createChatApi(overrides: Partial<ChatApi> = {}): ChatApi {
  return {
    ask: vi.fn(),
    listDocuments: vi.fn(async () => chatDocuments),
    listSessions: vi.fn(async () => sessionSummaries),
    createSession: vi.fn(async () => ({ ...sessionDetail, id: 12, title: '新对话', messages: [] })),
    getSession: vi.fn(async () => sessionDetail),
    sendMessage: vi.fn(async () => sessionDetail),
    streamMessage: vi.fn(async () => sessionDetail),
    updateSession: vi.fn(async () => sessionDetail),
    deleteSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('ChatHistoryPage', () => {
  it('renders document-scoped conversation history in three panes', async () => {
    const chatApi = createChatApi();

    render(<ChatHistoryPage chatApi={chatApi} />);

    expect(await screen.findByRole('heading', { name: '对话历史' })).toBeInTheDocument();
    expect(screen.getByText('对话记录按当前文档进行分组管理，不同文档的对话相互独立，互不交叉。')).toBeInTheDocument();

    const documentList = screen.getByLabelText('对话文档列表');
    expect(within(documentList).getByText('《深度学习原理与实践》第3版.pdf')).toBeInTheDocument();
    expect(within(documentList).getByText('自然语言处理综述.docx')).toBeInTheDocument();

    const sessionList = await screen.findByLabelText('当前文档对话列表');
    expect(await within(sessionList).findByText('Transformer 架构详解与注意力机制')).toBeInTheDocument();
    expect(await screen.findByText('请详细解释 Transformer 架构中的多头注意力机制的工作原理，并举例说明。')).toBeInTheDocument();
  });

  it('creates a new conversation for the selected document only', async () => {
    const created: ChatSessionDetailDto = { ...sessionDetail, id: 12, title: '新对话', messages: [] };
    const chatApi = createChatApi({
      createSession: vi.fn(async () => created),
    });

    render(<ChatHistoryPage chatApi={chatApi} />);

    const sessionList = await screen.findByLabelText('当前文档对话列表');
    await within(sessionList).findByText('Transformer 架构详解与注意力机制');
    fireEvent.click(screen.getByRole('button', { name: '新建对话' }));

    await waitFor(() => {
      expect(chatApi.createSession).toHaveBeenCalledWith({
        documentId: 1,
        title: '新对话',
      });
    });
    expect(screen.getAllByText('新对话').length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText('当前会话消息')).getByText('当前对话暂无消息。')).toBeInTheDocument();
  });

  it('deletes the active conversation through the backend API', async () => {
    const chatApi = createChatApi();

    render(<ChatHistoryPage chatApi={chatApi} />);

    await screen.findByText('Transformer 架构详解与注意力机制');
    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(chatApi.deleteSession).toHaveBeenCalledWith(11);
    });
  });
});
