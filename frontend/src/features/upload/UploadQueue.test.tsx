import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadQueue } from './UploadQueue';
import type { DocumentsApi } from '../../api/documents';
import type { DocumentDto } from '../../types/document';

const uploadedDocument: DocumentDto = {
  id: 7,
  originalFilename: '自然语言处理综述.docx',
  format: 'DOCX',
  status: 'PARSING',
  sizeBytes: 2048,
  uploadedAt: '2026-06-09T12:00:00Z',
  updatedAt: '2026-06-09T12:00:00Z',
};

describe('UploadQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows upload progress and stops polling when the document becomes READY', async () => {
    let reportProgress: ((percent: number) => void) | undefined;
    const api: Pick<DocumentsApi, 'upload' | 'get'> = {
      upload: vi.fn(async (_file, options) => {
        reportProgress = options?.onUploadProgress;
        return uploadedDocument;
      }),
      get: vi
        .fn()
        .mockResolvedValueOnce({ ...uploadedDocument, status: 'EMBEDDING' })
        .mockResolvedValueOnce({ ...uploadedDocument, status: 'READY', chunkCount: 8, vectorCount: 8 }),
    };

    render(<UploadQueue api={api} pollIntervalMs={1500} />);

    const file = new File(['hello'], '自然语言处理综述.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(screen.getByLabelText('选择文件'), { target: { files: [file] } });

    expect(api.upload).toHaveBeenCalledWith(file, expect.any(Object));

    act(() => {
      reportProgress?.(48);
    });
    expect(screen.getByText('48%')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(screen.getByText('向量化')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByText('已完成')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('starts uploads when files are dropped on the upload zone', async () => {
    const api: Pick<DocumentsApi, 'upload' | 'get'> = {
      upload: vi.fn(async () => uploadedDocument),
      get: vi.fn(),
    };

    render(<UploadQueue api={api} pollIntervalMs={1500} />);

    const file = new File(['hello'], '实验记录与结果分析.txt', { type: 'text/plain' });
    fireEvent.drop(screen.getByTestId('upload-dropzone'), {
      dataTransfer: {
        files: [file],
      },
    });

    expect(api.upload).toHaveBeenCalledWith(file, expect.any(Object));
  });

  it('does not render empty chunk metadata for failed uploads', async () => {
    const failedDocument: DocumentDto = {
      ...uploadedDocument,
      status: 'FAILED',
      chunkCount: null,
      vectorCount: null,
      errorMessage: 'DASHSCOPE_API_KEY is not configured.',
    };
    const api: Pick<DocumentsApi, 'upload' | 'get'> = {
      upload: vi.fn(async () => failedDocument),
      get: vi.fn(),
    };

    render(<UploadQueue api={api} pollIntervalMs={1500} />);

    const file = new File(['hello'], '实验记录与结果分析.txt', { type: 'text/plain' });
    await act(async () => {
      fireEvent.drop(screen.getByTestId('upload-dropzone'), {
        dataTransfer: {
          files: [file],
        },
      });
    });

    expect(screen.getByText('DASHSCOPE_API_KEY is not configured.')).toBeInTheDocument();
    expect(screen.queryByText(/^分块/)).not.toBeInTheDocument();
  });
});
