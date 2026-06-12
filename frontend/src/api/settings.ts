import { apiRequest } from './client';

export interface LlmSettings {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  frequencyPenalty: number;
  contextLength: number;
  streamOutput: boolean;
  systemPrompt: string;
}

export interface EmbeddingSettings {
  provider: string;
  model: string;
  batchSize: number;
  reprocessRequiredCount: number;
}

export interface RagSettings {
  topK: number;
  scoreThreshold: number;
  chunkSize: number;
  chunkOverlap: number;
  currentDocumentOnly: boolean;
  showCitations: boolean;
}

export interface VectorStoreSettings {
  type: string;
  collectionName: string;
  persistDir: string;
}

export interface SettingsResponse {
  llm: LlmSettings;
  embedding: EmbeddingSettings;
  vectorStore: VectorStoreSettings;
  rag: RagSettings;
  updatedAt: string;
  updatedBy: string;
}

export interface SettingsUpdateRequest {
  llm: LlmSettings;
  embedding: Omit<EmbeddingSettings, 'reprocessRequiredCount'>;
  vectorStore: VectorStoreSettings;
  rag: RagSettings;
}

export interface ModelOption {
  provider: string;
  model: string;
  label: string;
  free: boolean;
  recommended: boolean;
  note: string;
}

export interface SettingsModelsResponse {
  llmModels: ModelOption[];
  embeddingModels: ModelOption[];
}

export interface SettingsTestResponse {
  kind: string;
  connected: boolean;
  message: string;
  llmModel: string;
  embeddingModel: string;
}

export const settingsApi = {
  get() {
    return apiRequest<SettingsResponse>('/settings');
  },

  models() {
    return apiRequest<SettingsModelsResponse>('/settings/models');
  },

  save(payload: SettingsUpdateRequest) {
    return apiRequest<SettingsResponse>('/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  test(kind: 'status' | 'llm' | 'embedding', settings: SettingsUpdateRequest) {
    return apiRequest<SettingsTestResponse>('/settings/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind, settings }),
    });
  },
};
