import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage';
import type { ChatApi } from '../../api/chat';
import type { DocumentsApi } from '../../api/documents';
import type { DocumentDto } from '../../types/document';

const readyDocument: DocumentDto = {
  id: 1,
  originalFilename: '《深度学习原理与实践》第3章.pdf',
  format: 'PDF',
  status: 'READY',
  sizeBytes: 4096,
  uploadedAt: '2026-06-09T12:00:00Z',
  updatedAt: '2026-06-09T12:00:00Z',
};

describe('ChatPage', () => {
  it('asks a question for a READY document and highlights citations from answer markers or cards', async () => {
    const documentsApi: Pick<DocumentsApi, 'list'> = {
      list: vi.fn(async () => ({ items: [readyDocument], page: 0, size: 20, total: 1 })),
    };
    const chatApi: Pick<ChatApi, 'ask'> = {
      ask: vi.fn(async () => ({
        answer: '该章节介绍了反向传播和梯度下降。[1] 也讨论了正则化。[2]',
        sources: [
          {
            documentId: 1,
            filename: readyDocument.originalFilename,
            chunkId: '1-1',
            score: 0.91,
            text: '反向传播用于计算神经网络参数梯度。',
          },
          {
            documentId: 1,
            filename: readyDocument.originalFilename,
            chunkId: '1-2',
            score: 0.83,
            text: '正则化可以缓解模型过拟合。',
          },
        ],
      })),
    };

    render(<ChatPage documentsApi={documentsApi} chatApi={chatApi} />);

    await waitFor(() => expect(screen.getByLabelText('选择问答文档')).toHaveValue('1'));

    fireEvent.change(screen.getByLabelText('问题输入'), {
      target: { value: '这章讲了什么？' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => expect(chatApi.ask).toHaveBeenCalledWith({ documentIds: [1], question: '这章讲了什么？', topK: 5 }));

    const firstCitation = screen.getByTestId('citation-card-1-1');
    const secondCitation = screen.getByTestId('citation-card-1-2');
    expect(firstCitation).toHaveClass('selected');
    expect(secondCitation).not.toHaveClass('selected');

    fireEvent.click(screen.getByRole('button', { name: '引用 2' }));
    expect(secondCitation).toHaveClass('selected');
    expect(firstCitation).not.toHaveClass('selected');

    fireEvent.click(within(firstCitation).getByRole('button', { name: '查看引用 1' }));
    expect(firstCitation).toHaveClass('selected');
  });
});
