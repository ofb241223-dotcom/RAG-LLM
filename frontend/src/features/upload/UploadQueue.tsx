import { useCallback, useEffect, useRef, useState } from 'react';
import { CloudUpload, Eye, FolderOpen, PauseCircle, Trash2, XCircle } from 'lucide-react';
import { documentsApi as defaultDocumentsApi, type DocumentsApi } from '../../api/documents';
import type { DocumentDto, ProcessingStatus } from '../../types/document';
import { formatBytes } from '../../utils/format';
import { getStatusClass, getStatusLabel, isTerminalStatus } from '../documents/status';

type UploadStatus = 'queued' | 'uploading' | 'cancelled' | ProcessingStatus;

interface UploadItem {
  localId: string;
  file: File;
  filename: string;
  sizeBytes: number;
  uploadPercent: number;
  status: UploadStatus;
  documentId?: number;
  errorMessage?: string | null;
  chunkCount?: number | null;
  vectorCount?: number | null;
  document?: DocumentDto;
}

interface UploadQueueProps {
  api?: Pick<DocumentsApi, 'upload' | 'get'>;
  maxConcurrentUploads?: number;
  pollIntervalMs?: number;
  onDocumentReady?: (document: DocumentDto) => void;
  onOpenDocumentDetail?: (document: DocumentDto) => void;
}

const DEFAULT_MAX_CONCURRENT_UPLOADS = 3;

function getUploadLabel(status: UploadStatus): string {
  if (status === 'queued') return '等待中';
  if (status === 'uploading') return '上传中';
  if (status === 'cancelled') return '已取消';
  return getStatusLabel(status);
}

function getUploadStatusClass(status: UploadStatus): string {
  if (status === 'queued') return 'queued';
  if (status === 'uploading') return 'uploading';
  if (status === 'cancelled') return 'cancelled';
  return getStatusClass(status);
}

function isFinalUploadStatus(status: UploadStatus): boolean {
  return status === 'cancelled' || (status !== 'queued' && status !== 'uploading' && isTerminalStatus(status));
}

function getActiveStepIndex(items: UploadItem[]): number {
  if (items.length === 0) return -1;
  return Math.max(
    ...items.map((item) => {
      if (item.status === 'READY') return 4;
      if (item.status === 'EMBEDDING') return 3;
      if (item.status === 'PARSING' || item.status === 'UPLOADED') return 1;
      if (item.status === 'queued' || item.status === 'uploading') return 0;
      return -1;
    }),
  );
}

function getFileFormat(filename: string): string {
  const extension = filename.includes('.') ? filename.split('.').pop() : undefined;
  return (extension || 'DOC').toUpperCase();
}

function getFileTone(filename: string): string {
  const format = getFileFormat(filename);
  if (format === 'PDF') return 'pdf';
  if (format === 'TXT') return 'txt';
  return 'word';
}

export function UploadQueue({
  api = defaultDocumentsApi,
  maxConcurrentUploads = DEFAULT_MAX_CONCURRENT_UPLOADS,
  pollIntervalMs = 1700,
  onDocumentReady,
  onOpenDocumentDetail,
}: UploadQueueProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const pollTimers = useRef<Map<string, number>>(new Map());
  const uploadControllers = useRef<Map<string, AbortController>>(new Map());
  const startedIds = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      pollTimers.current.forEach((timer) => window.clearTimeout(timer));
      uploadControllers.current.forEach((controller) => controller.abort());
    },
    [],
  );

  const updateItem = useCallback((localId: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }, []);

  const schedulePoll = useCallback((localId: string, documentId: number) => {
    const timer = window.setTimeout(async () => {
      try {
        const document = await api.get(documentId);
        updateItem(localId, {
          status: document.status,
          chunkCount: document.chunkCount,
          vectorCount: document.vectorCount,
          errorMessage: document.errorMessage,
          document,
          uploadPercent: 100,
        });

        if (document.status === 'READY') {
          onDocumentReady?.(document);
        }

        if (!isTerminalStatus(document.status)) {
          schedulePoll(localId, documentId);
        } else {
          pollTimers.current.delete(localId);
        }
      } catch (error) {
        updateItem(localId, {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : '轮询文档状态失败',
        });
        pollTimers.current.delete(localId);
      }
    }, pollIntervalMs);
    pollTimers.current.set(localId, timer);
  }, [api, onDocumentReady, pollIntervalMs, updateItem]);

  const uploadItem = useCallback(async (item: UploadItem) => {
    if (startedIds.current.has(item.localId)) {
      return;
    }
    startedIds.current.add(item.localId);
    const controller = new AbortController();
    uploadControllers.current.set(item.localId, controller);
    updateItem(item.localId, { status: 'uploading', uploadPercent: 0 });

    try {
      const upload = api.upload as (
        file: File,
        options?: { onUploadProgress?: (percent: number) => void; signal?: AbortSignal },
      ) => Promise<DocumentDto>;
      const document = await upload(item.file, {
        onUploadProgress: (percent) => updateItem(item.localId, { uploadPercent: percent }),
        signal: controller.signal,
      });
      uploadControllers.current.delete(item.localId);
      updateItem(item.localId, {
        documentId: document.id,
        status: document.status,
        uploadPercent: 100,
        chunkCount: document.chunkCount,
        vectorCount: document.vectorCount,
        errorMessage: document.errorMessage,
        document,
      });

      if (document.status === 'READY') {
        onDocumentReady?.(document);
      }

      if (!isTerminalStatus(document.status)) {
        schedulePoll(item.localId, document.id);
      }
    } catch (error) {
      uploadControllers.current.delete(item.localId);
      updateItem(item.localId, {
        status: controller.signal.aborted ? 'cancelled' : 'FAILED',
        errorMessage: controller.signal.aborted ? null : error instanceof Error ? error.message : '上传失败',
      });
    }
  }, [api, onDocumentReady, schedulePoll, updateItem]);

  useEffect(() => {
    const activeCount = items.filter((item) => item.status === 'uploading').length;
    const availableSlots = Math.max(0, maxConcurrentUploads - activeCount);
    if (availableSlots === 0) return;

    items
      .filter((item) => item.status === 'queued' && !startedIds.current.has(item.localId))
      .slice(0, availableSlots)
      .forEach((item) => {
        void uploadItem(item);
      });
  }, [items, maxConcurrentUploads, uploadItem]);

  const createUploadItem = (file: File): UploadItem => ({
    localId: `${file.name}-${file.lastModified}-${crypto.randomUUID?.() ?? Date.now()}`,
    file,
    filename: file.name,
    sizeBytes: file.size,
    uploadPercent: 0,
    status: 'queued',
  });

  const handleFiles = (files: FileList | null) => {
    const nextItems = Array.from(files ?? []).map((file) => createUploadItem(file));
    if (nextItems.length === 0) {
      return;
    }
    setItems((current) => [...nextItems, ...current]);
  };

  const cancelItem = (localId: string) => {
    const controller = uploadControllers.current.get(localId);
    if (controller) {
      controller.abort();
      return;
    }

    const pollTimer = pollTimers.current.get(localId);
    if (pollTimer) {
      window.clearTimeout(pollTimer);
      pollTimers.current.delete(localId);
    }

    startedIds.current.delete(localId);
    setItems((current) => current.filter((item) => item.localId !== localId));
  };

  const clearCompleted = () => {
    setItems((current) => current.filter((item) => !isFinalUploadStatus(item.status)));
  };

  const completedCount = items.filter((item) => item.status === 'READY').length;
  const activeStepIndex = getActiveStepIndex(items);

  return (
    <section className="upload-workbench">
      <article className="upload-ingest-card">
        <ol className="upload-steps" aria-label="上传处理流程">
          {[
            ['上传文档', '文件上传中'],
            ['文本提取', '解析文档内容'],
            ['文本分块', '切分文本片段'],
            ['向量化', '生成向量表示'],
            ['完成', '导入知识库'],
          ].map(([label, detail], index) => (
            <li className={activeStepIndex >= index ? 'active' : ''} key={label}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </li>
          ))}
        </ol>

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
          <div className="dropzone-art" aria-hidden="true">
            <i className="drop-file pdf">PDF</i>
            <span>
              <CloudUpload size={58} />
            </span>
            <i className="drop-file txt">TXT</i>
          </div>
          <strong>
            拖拽文件到此处，或<span>点击上传</span>
          </strong>
          <small>支持 PDF、TXT、DOCX、DOC 格式，单个文件最大 200MB</small>
          <em>
            <FolderOpen size={17} />
            选择文件
          </em>
          <input
            aria-label="选择文件"
            accept=".pdf,.txt,.doc,.docx"
            multiple
            type="file"
            onChange={(event) => handleFiles(event.currentTarget.files)}
          />
        </label>
      </article>

      <article className="upload-list" aria-live="polite">
        <div className="upload-list-heading">
          <h2>文件上传列表（{items.length}）</h2>
          <button className="ghost-action" disabled={!items.some((item) => isFinalUploadStatus(item.status))} type="button" onClick={clearCompleted}>
            <Trash2 size={16} />
            清空列表
          </button>
        </div>
        <div className="upload-table">
          <div className="upload-table-row header">
            <span>文件名</span>
            <span>大小</span>
            <span>进度</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          {items.length === 0 ? <p className="upload-empty-state">尚未选择文件。</p> : null}
          {items.map((item) => (
            <div className="upload-table-row" key={item.localId}>
              <span className="upload-file-cell" title={item.filename}>
                <i className={`file-badge ${getFileTone(item.filename)}`}>{getFileFormat(item.filename)}</i>
                <strong>{item.filename}</strong>
                {item.errorMessage ? <small className="row-error">{item.errorMessage}</small> : null}
              </span>
              <span>{formatBytes(item.sizeBytes)}</span>
              <span className="upload-progress-cell">
                <span className={`progress-track ${getUploadStatusClass(item.status)}`}>
                  <span style={{ width: `${item.uploadPercent}%` }} />
                </span>
                <b>{item.uploadPercent}%</b>
              </span>
              <span>
                <mark className={`status-badge ${getUploadStatusClass(item.status)}`}>{getUploadLabel(item.status)}</mark>
              </span>
              <span className="upload-row-actions">
                {item.document ? (
                  <button aria-label={`查看处理详情 ${item.filename}`} className="icon-button" type="button" onClick={() => onOpenDocumentDetail?.(item.document!)}>
                    <Eye size={15} />
                  </button>
                ) : null}
                {item.status === 'uploading' ? (
                  <button aria-label={`取消 ${item.filename}`} className="icon-button" type="button" onClick={() => cancelItem(item.localId)}>
                    <PauseCircle size={15} />
                  </button>
                ) : null}
                {item.status !== 'uploading' ? (
                  <button aria-label={`移除 ${item.filename}`} className="icon-button" type="button" onClick={() => cancelItem(item.localId)}>
                    <XCircle size={15} />
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <footer>
          <span>已上传 {completedCount}/{items.length} 个文件</span>
        </footer>
      </article>
    </section>
  );
}
