import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';
import type { ChatApi, ChatSessionSummaryDto } from '../../api/chat';
import type { DocumentsApi } from '../../api/documents';
import type { DocumentDto } from '../../types/document';

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
];

function createDocumentsApi(): Pick<DocumentsApi, 'list'> {
  return {
    list: vi.fn(async () => ({ items: documents, page: 0, size: 10, total: documents.length })),
  };
}

function createChatApi(): Pick<ChatApi, 'listSessions'> {
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

  return {
    listSessions: vi.fn(async (documentId: number) => (documentId === 2 ? sessions : [])),
  };
}

describe('DashboardPage', () => {
  it('renders the newest four real activity events instead of hard-coded demo activities', async () => {
    render(<DashboardPage documentsApi={createDocumentsApi()} chatApi={createChatApi()} onNavigate={vi.fn()} />);

    const panel = await screen.findByRole('heading', { name: '最近动态' }).then((heading) => heading.closest('article'));
    expect(panel).not.toBeNull();

    await waitFor(() => {
      expect(within(panel as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
    });

    expect(within(panel as HTMLElement).getByText('文档《最新上传.pdf》解析完成')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('向量库更新完成，新增 3 个向量')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('与文档《问答文档》进行了问答')).toBeInTheDocument();
    expect(within(panel as HTMLElement).getByText('上传了文档《最新上传.pdf》')).toBeInTheDocument();
    expect(within(panel as HTMLElement).queryByText('上传了文档《深度学习原理与实践》第3章.pdf')).not.toBeInTheDocument();
  });
});
