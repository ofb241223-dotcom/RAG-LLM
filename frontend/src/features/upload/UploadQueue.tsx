import { useEffect, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import type { DocumentDto, ProcessingStatus } from '../../types/document';
import { getStatusClass, getStatusLabel, isTerminalStatus } from '../documents/status';

type UploadStatus = 'queued' | 'uploading' | ProcessingStatus;

interface UploadItem {
  localId: string;
  filename: string;
  uploadPercent: number;
  status: UploadStatus;
  documentId?: number;
  errorMessage?: string | null;
  chunkCount?: number | null;
  vectorCount?: number | null;
}

interface UploadQueueProps {
  api?: Pick<DocumentsApi, 'upload' | 'get'>;
  pollIntervalMs?: number;
  onDocumentReady?: (document: DocumentDto) => void;
}

function getUploadLabel(status: UploadStatus): string {
  if (status === 'queued') return '等待上传';
  if (status === 'uploading') return '上传中';
  return getStatusLabel(status);
}

export function UploadQueue({ api = defaultDocumentsApi, pollIntervalMs = 1700, onDocumentReady }: UploadQueueProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const updateItem = (localId: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  };

  const schedulePoll = (localId: string, documentId: number) => {
    const timer = window.setTimeout(async () => {
      try {
        const document = await api.get(documentId);
        updateItem(localId, {
          status: document.status,
          chunkCount: document.chunkCount,
          vectorCount: document.vectorCount,
          errorMessage: document.errorMessage,
          uploadPercent: 100,
        });

        if (document.status === 'READY') {
          onDocumentReady?.(document);
        }

        if (!isTerminalStatus(document.status)) {
          schedulePoll(localId, documentId);
        }
      } catch (error) {
        updateItem(localId, {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : '轮询文档状态失败',
        });
      }
    }, pollIntervalMs);
    timers.current.push(timer);
  };

  const startUpload = async (file: File) => {
    const localId = `${file.name}-${file.lastModified}-${crypto.randomUUID?.() ?? Date.now()}`;
    setItems((current) => [
      {
        localId,
        filename: file.name,
        uploadPercent: 0,
        status: 'uploading',
      },
      ...current,
    ]);

    try {
      const document = await api.upload(file, {
        onUploadProgress: (percent) => updateItem(localId, { uploadPercent: percent }),
      });
      updateItem(localId, {
        documentId: document.id,
        status: document.status,
        uploadPercent: 100,
        chunkCount: document.chunkCount,
        vectorCount: document.vectorCount,
        errorMessage: document.errorMessage,
      });

      if (document.status === 'READY') {
        onDocumentReady?.(document);
      }

      if (!isTerminalStatus(document.status)) {
        schedulePoll(localId, document.id);
      }
    } catch (error) {
      updateItem(localId, {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : '上传失败',
      });
    }
  };

  const handleFiles = (files: FileList | null) => {
    Array.from(files ?? []).forEach((file) => {
      void startUpload(file);
    });
  };

  return (
    <section className="upload-queue">
      <label
        aria-label="上传区域"
        className={`upload-dropzone${isDragging ? ' is-dragging' : ''}`}
        data-testid="upload-dropzone"
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <FileUp size={34} />
        <strong>上传 PDF、TXT 或 Word 文档</strong>
        <span>上传完成后系统会自动解析、分块并写入向量库。</span>
        <input
          aria-label="选择文件"
          accept=".pdf,.txt,.doc,.docx"
          multiple
          type="file"
          onChange={(event) => handleFiles(event.currentTarget.files)}
        />
      </label>

      <div className="upload-list" aria-live="polite">
        {items.length === 0 ? <p className="table-state">尚未选择文件。</p> : null}
        {items.map((item) => (
          <article className="upload-item" key={item.localId}>
            <div>
              <strong>{item.filename}</strong>
              <span className={`status-badge ${getStatusClass(item.status === 'uploading' || item.status === 'queued' ? 'UPLOADED' : item.status)}`}>
                {getUploadLabel(item.status)}
              </span>
            </div>
            <div className="progress-row">
              <div className="progress-track">
                <span style={{ width: `${item.uploadPercent}%` }} />
              </div>
              <b>{item.uploadPercent}%</b>
            </div>
            {item.chunkCount != null ? <small>分块 {item.chunkCount}，向量 {item.vectorCount ?? item.chunkCount}</small> : null}
            {item.errorMessage ? <small className="row-error">{item.errorMessage}</small> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
