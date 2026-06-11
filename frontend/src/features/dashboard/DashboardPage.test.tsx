import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import type { ChatApi, ChatDocumentDto, ChatSessionSummaryDto } from '../../api/chat';
import type { DocumentsApi } from '../../api/documents';
import type { DocumentActivityDto, DocumentDto } from '../../types/document';

const documents: DocumentDto[] = [
  {
    id: 1,
    originalFilename: '最新上传.pdf',
    format: 'PDF',
    source: 'MANUAL_UPLOAD',
    status: 'READY',
    sizeBytes: 1024,
    uploadedAt: '2026-06-11T04:00:00+08:00',
    updatedAt: '2026-06-11T04:03:00+08:00',
    chunkCount: 3,
    vectorCount: 3,
  },
  {
    id: 2,
    originalFilename: '问答文档.docx',
    format: 'DOCX',
    source: 'MANUAL_UPLOAD',
    status: 'READY',
    sizeBytes: 2048,
    uploadedAt: '2026-06-11T03:00:00+08:00',
    updatedAt: '2026-06-11T03:04:00+08:00',
    chunkCount: 2,
    vectorCount: 2,
  },
  {
    id: 3,
    originalFilename: '第三份.xlsx',
    format: 'XLSX',
    source: 'MANUAL_UPLOAD',
    status: 'READY',
    sizeBytes: 4096,
    uploadedAt: '2026-06-11T02:00:00+08:00',
    updatedAt: '2026-06-11T02:04:00+08:00',
    chunkCount: 4,
    vectorCount: 4,
  },
  {
    id: 4,
    originalFilename: '第四份.txt',
    format: 'TXT',
    source: 'MANUAL_UPLOAD',
    status: 'READY',
    sizeBytes: 512,
    uploadedAt: '2026-06-11T01:00:00+08:00',
    updatedAt: '2026-06-11T01:04:00+08:00',
    chunkCount: 1,
    vectorCount: 1,
  },
];

function createDocumentsApi(activity = false): Pick<DocumentsApi, 'list' | 'activities'> {
  const deletionActivity: DocumentActivityDto = {
    id: 21,
    label: '删除了文档《旧文档.txt》',
    tone: 'RED',
    occurredAt: '2026-06-11T04:04:00+08:00',
  };

  return {
    list: vi.fn(async () => ({ items: documents, page: 0, size: 10, total: documents.length })),
    activities: vi.fn(async () => (activity ? [deletionActivity] : [])),
  };
}

function createDocumentsApiWithActivities(activities: DocumentActivityDto[]): Pick<DocumentsApi, 'list' | 'activities'> {
  return {
    list: vi.fn(async () => ({ items: documents, page: 0, size: 10, total: documents.length })),
    activities: vi.fn(async () => activities),
  };
}

function createChatApi(): Pick<ChatApi, 'listSessions' | 'listDocuments'> {
  const sessions: ChatSessionSummaryDto[] = [
    {
      id: 9,
      documentId: 2,
      title: '问答',
      status: 'ACTIVE',
      messageCount: 2,
      createdAt: '2026-06-11T03:10:00+08:00',
      updatedAt: '2026-06-11T04:02:00+08:00',
    },
  ];
  const chatDocuments: ChatDocumentDto[] = [
    {
      id: 1,
      originalFilename: '最新上传.pdf',
      format: 'PDF',
      sizeBytes: 1024,
      chunkCount: 3,
      vectorCount: 3,
      sessionCount: 2,
      lastActiveAt: '2026-06-11T04:02:00+08:00',
    },
    {
      id: 2,
      originalFilename: '问答文档.docx',
      format: 'DOCX',
      sizeBytes: 2048,
      chunkCount: 2,
      vectorCount: 2,
      sessionCount: 1,
      lastActiveAt: '2026-06-11T04:02:00+08:00',
    },
  ];

  return {
    listSessions: vi.fn(async (documentId: number) => (documentId === 2 ? sessions : [])),
    listDocuments: vi.fn(async () => chatDocuments),
  };
}

describe('DashboardPage', () => {
  it('renders the newest five real activity events and four recent uploads', async () => {
    render(<DashboardPage documentsApi={createDocumentsApi()} chatApi={createChatApi()} onNavigate={vi.fn()} />);

    const documentsPanel = await screen.findByRole('heading', { name: '最近上传的文档' }).then((heading) => heading.closest('article'));
    expect(documentsPanel).not.toBeNull();
    await waitFor(() => {
      expect(within(documentsPanel as HTMLElement).getAllByTestId(/document-row-/u)).toHaveLength(4);
    });

    const panel = await screen.findByRole('heading', { name: '最近动态' }).then((heading) => heading.closest('article'));
    expect(panel).not.toBeNull();

    await waitFor(() => {
      expect(within(panel as HTMLElement).getAllByRole('listitem')).toHaveLength(5);
    });

    expect(within(panel as HTMLElement).getByText('文档《最新上传.pdf》解析完成')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('向量库更新完成，新增 3 个向量')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('与文档《问答文档》进行了问答')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('上传了文档《最新上传.pdf》')).toBeInTheDocument();
    expect(within(panel as HTMLElement).queryByText('上传了文档《深度学习原理与实践》第3章.pdf')).not.toBeInTheDocument();
    const conversationCard = screen.getByText('对话总数').closest('article');
    expect(conversationCard).not.toBeNull();
    expect(within(conversationCard as HTMLElement).getByText('3')).toBeInTheDocument();
  });

  it('opens all activity events in an in-page dialog', async () => {
    const onNavigate = vi.fn();
    render(<DashboardPage documentsApi={createDocumentsApi(true)} chatApi={createChatApi()} onNavigate={onNavigate} />);

    const panel = await screen.findByRole('heading', { name: '最近动态' }).then((heading) => heading.closest('article'));
    expect(panel).not.toBeNull();

    await waitFor(() => {
      expect(within(panel as HTMLElement).getAllByRole('listitem')).toHaveLength(5);
    });

    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: '查看全部' }));

    const dialog = await screen.findByRole('dialog', { name: '全部动态' });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(14);
    expect(within(dialog).getByText('删除了文档《旧文档.txt》')).toBeInTheDocument();
    expect(within(dialog).getByText('上传了文档《问答文档.docx》')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '关闭全部动态' }));
    expect(screen.queryByRole('dialog', { name: '全部动态' })).not.toBeInTheDocument();
  });

  it('does not duplicate upload activities already persisted by the backend', async () => {
    render(
      <DashboardPage
        documentsApi={createDocumentsApiWithActivities([
          {
            id: 22,
            label: '上传了文档《最新上传.pdf》',
            tone: 'BLUE',
            occurredAt: '2026-06-11T04:00:00+08:00',
          },
        ])}
        chatApi={createChatApi()}
        onNavigate={vi.fn()}
      />,
    );

    const panel = await screen.findByRole('heading', { name: '最近动态' }).then((heading) => heading.closest('article'));
    expect(panel).not.toBeNull();

    await waitFor(() => {
      expect(within(panel as HTMLElement).getAllByRole('listitem')).toHaveLength(5);
    });

    fireEvent.click(within(panel as HTMLElement).getByRole('button', { name: '查看全部' }));

    const dialog = await screen.findByRole('dialog', { name: '全部动态' });
    expect(within(dialog).getAllByText('上传了文档《最新上传.pdf》')).toHaveLength(1);
  });
});
