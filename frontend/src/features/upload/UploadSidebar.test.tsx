import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UploadSidebar } from './UploadSidebar';
import type { SettingsResponse } from '../../api/settings';

const settings: SettingsResponse = {
  llm: {
    provider: 'google',
    model: 'gemini-3.1-flash-lite',
    temperature: 0.2,
    maxTokens: 1024,
    topP: 0.9,
    frequencyPenalty: 0,
    contextLength: 128000,
    streamOutput: true,
    systemPrompt: '只基于文档回答。',
  },
  embedding: {
    provider: 'openrouter',
    model: 'openai/text-embedding-3-small',
    batchSize: 10,
    reprocessRequiredCount: 0,
  },
  vectorStore: {
    type: 'chroma',
    collectionName: 'rag_documents_v1',
    persistDir: './rag_data/chroma',
  },
  rag: {
    topK: 5,
    scoreThreshold: 0.3,
    chunkSize: 900,
    chunkOverlap: 120,
    currentDocumentOnly: true,
    showCitations: true,
  },
  updatedAt: '2026-06-11T12:00:00Z',
  updatedBy: '科大人',
};

describe('UploadSidebar', () => {
  it('loads and saves real parsing settings through the settings api', async () => {
    const settingsApi = {
      get: vi.fn(async () => settings),
      models: vi.fn(async () => ({
        llmModels: [],
        embeddingModels: [
          {
            provider: 'openrouter',
            model: 'openai/text-embedding-3-small',
            label: 'openai/text-embedding-3-small',
            free: false,
            recommended: false,
            note: '',
          },
        ],
      })),
      save: vi.fn(async (payload) => ({
        ...settings,
        rag: {
          ...settings.rag,
          chunkSize: payload.rag.chunkSize,
        },
      })),
      test: vi.fn(),
    };

    render(<UploadSidebar settingsApi={settingsApi} />);

    const chunkSize = await screen.findByLabelText('分块大小');
    expect(chunkSize).toHaveValue(900);

    fireEvent.change(chunkSize, { target: { value: '600' } });
    fireEvent.blur(chunkSize);

    await waitFor(() => {
      expect(settingsApi.save).toHaveBeenCalledWith(expect.objectContaining({
        rag: expect.objectContaining({ chunkSize: 600 }),
      }));
    });
    expect(await screen.findByText('解析配置已保存')).toBeInTheDocument();
  });
});
