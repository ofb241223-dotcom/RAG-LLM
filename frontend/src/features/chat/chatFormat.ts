import type { ChatCitationDto, ChatDocumentDto, ChatMessageDto, ChatSessionDetailDto, ChatSessionSummaryDto } from '../../api/chat';
import type { DocumentDto } from '../../types/document';

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '暂无记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatTime(value?: string | null): string {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function getDocumentMeta(document: ChatDocumentDto | DocumentDto): string {
  return `${document.format} · ${formatBytes(document.sizeBytes)}`;
}

export function getSessionCitations(session: ChatSessionDetailDto | null): ChatCitationDto[] {
  return session?.messages.flatMap((message) => (message.role === 'ASSISTANT' ? message.citations : [])) ?? [];
}

export function findCitationByMarker(citations: ChatCitationDto[], markerIndex: number): ChatCitationDto | undefined {
  return citations.find((citation) => citation.markerIndex === markerIndex) ?? citations[markerIndex - 1];
}

export function latestAssistantMessage(messages: ChatMessageDto[]): ChatMessageDto | undefined {
  return messages
    .slice()
    .reverse()
    .find((message) => message.role === 'ASSISTANT');
}

export function titleFromQuestion(question: string): string {
  const trimmed = question.trim();
  if (trimmed.length <= 28) return trimmed || '新对话';
  return `${trimmed.slice(0, 28)}...`;
}

export function toSessionSummary(detail: ChatSessionDetailDto): ChatSessionSummaryDto {
  return {
    id: detail.id,
    documentId: detail.document.id,
    title: detail.title,
    status: detail.status,
    messageCount: detail.messages.length,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}
