import { apiRequest } from './client';
import type { ChatAnswerDto, ChatAskRequest } from '../types/chat';

export interface ChatApi {
  ask(request: ChatAskRequest): Promise<ChatAnswerDto>;
}

export const chatApi: ChatApi = {
  ask(request) {
    return apiRequest<ChatAnswerDto>('/qa/ask', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topK: 5,
        ...request,
      }),
    });
  },
};
