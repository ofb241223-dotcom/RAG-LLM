import { ApiError, apiRequest, buildApiUrl } from './client';
import type { ChatAnswerDto, ChatAskRequest } from '../types/chat';
import type { DocumentDto, DocumentFormat } from '../types/document';

export type ChatRole = 'USER' | 'ASSISTANT';
export type ChatMessageStatus = 'SUCCESS' | 'PENDING' | 'ERROR';
export type ChatSessionStatus = 'ACTIVE';

export interface ChatDocumentDto {
  id: number;
  originalFilename: string;
  format: DocumentFormat;
  sizeBytes: number;
  chunkCount?: number | null;
  vectorCount?: number | null;
  sessionCount: number;
  lastActiveAt?: string | null;
}

export interface ChatCitationDto {
  key: string;
  markerIndex: number;
  documentId: number;
  filename: string;
  chunkId: string;
  score: number;
  text: string;
  page?: number;
}

export interface ChatMessageDto {
  id: number;
  role: ChatRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: string;
  citations: ChatCitationDto[];
  errorMessage?: string | null;
}

export interface ChatSessionSummaryDto {
  id: number;
  documentId: number;
  title: string;
  status: ChatSessionStatus;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetailDto {
  id: number;
  document: DocumentDto | ChatDocumentDto;
  title: string;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageDto[];
}

export interface ChatCreateSessionRequest {
  documentId: number;
  title?: string;
}

export interface ChatUpdateSessionRequest {
  title?: string;
}

export interface ChatAskMessageRequest {
  question: string;
  topK?: number;
}

export interface ChatStreamHandlers {
  onChunk?: (content: string) => void;
  onSession?: (session: ChatSessionDetailDto) => void;
}

export interface ChatApi {
  ask(request: ChatAskRequest): Promise<ChatAnswerDto>;
  listDocuments(): Promise<ChatDocumentDto[]>;
  listSessions(documentId: number): Promise<ChatSessionSummaryDto[]>;
  createSession(request: ChatCreateSessionRequest): Promise<ChatSessionDetailDto>;
  getSession(sessionId: number): Promise<ChatSessionDetailDto>;
  sendMessage(sessionId: number, request: ChatAskMessageRequest): Promise<ChatSessionDetailDto>;
  streamMessage(sessionId: number, request: ChatAskMessageRequest, handlers?: ChatStreamHandlers): Promise<ChatSessionDetailDto>;
  updateSession(sessionId: number, request: ChatUpdateSessionRequest): Promise<ChatSessionDetailDto>;
  deleteSession(sessionId: number): Promise<void>;
}

function payloadForMessage(request: ChatAskMessageRequest) {
  return JSON.stringify(request.topK ? request : { question: request.question });
}

async function readNdjsonStream(response: Response, handlers?: ChatStreamHandlers): Promise<ChatSessionDetailDto> {
  if (!response.body) {
    throw new ApiError('流式响应不可用', response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalSession: ChatSessionDetailDto | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const event = JSON.parse(trimmed) as { type: string; content?: string; session?: ChatSessionDetailDto };
      if (event.type === 'chunk' && event.content) {
        handlers?.onChunk?.(event.content);
      }
      if (event.type === 'session' && event.session) {
        finalSession = event.session;
        handlers?.onSession?.(event.session);
      }
    }

    if (done) break;
  }

  const trailing = buffer.trim();
  if (trailing) {
    const event = JSON.parse(trailing) as { type: string; content?: string; session?: ChatSessionDetailDto };
    if (event.type === 'session' && event.session) {
      finalSession = event.session;
      handlers?.onSession?.(event.session);
    }
  }

  if (!finalSession) {
    throw new ApiError('流式响应缺少最终会话数据', response.status);
  }
  return finalSession;
}

export const chatApi: ChatApi = {
  ask(request) {
    return apiRequest<ChatAnswerDto>('/qa/ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
      }),
    });
  },

  listDocuments() {
    return apiRequest<ChatDocumentDto[]>('/chat/documents');
  },

  listSessions(documentId) {
    return apiRequest<ChatSessionSummaryDto[]>(`/chat/sessions?documentId=${encodeURIComponent(documentId)}`);
  },

  createSession(request) {
    return apiRequest<ChatSessionDetailDto>('/chat/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  },

  getSession(sessionId) {
    return apiRequest<ChatSessionDetailDto>(`/chat/sessions/${sessionId}`);
  },

  sendMessage(sessionId, request) {
    return apiRequest<ChatSessionDetailDto>(`/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: payloadForMessage(request),
    });
  },

  async streamMessage(sessionId, request, handlers) {
    let response: Response;
    try {
      response = await fetch(buildApiUrl(`/chat/sessions/${sessionId}/messages/stream`), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/x-ndjson',
        },
        body: payloadForMessage(request),
      });
    } catch (error) {
      throw new ApiError('后端服务不可用，请确认前后端服务已启动。', 0, error);
    }
    if (!response.ok) {
      throw new ApiError(`流式问答失败 (${response.status})`, response.status);
    }
    return readNdjsonStream(response, handlers);
  },

  updateSession(sessionId, request) {
    return apiRequest<ChatSessionDetailDto>(`/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
    });
  },

  deleteSession(sessionId) {
    return apiRequest<void>(`/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  },
};
