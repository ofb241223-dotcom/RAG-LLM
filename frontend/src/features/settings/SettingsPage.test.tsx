import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
import type { SettingsModelsResponse, SettingsResponse, SettingsUpdateRequest } from '../../api/settings';

const DEFAULT_SYSTEM_PROMPT = '你是一个严谨的文档问答助手，只能依据给定引用片段回答。\n如果无法从资料中读取答案,请诚实说明';

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
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  },
  embedding: {
    provider: 'google',
    model: 'gemini-embedding-001',
    batchSize: 10,
    reprocessRequiredCount: 0,
  },
  rag: {
    topK: 5,
    scoreThreshold: 0.3,
    chunkSize: 500,
    chunkOverlap: 80,
    currentDocumentOnly: true,
    showCitations: true,
  },
  updatedAt: '2026-06-10T12:00:00Z',
  updatedBy: '张同学',
  vectorStore: {
    type: 'chroma',
    collectionName: 'rag_documents_v1',
    persistDir: './rag_data/chroma',
  },
};

const models: SettingsModelsResponse = {
  llmModels: [
    { provider: 'google', model: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', free: false, recommended: true, note: '推荐' },
    { provider: 'openrouter', model: 'openai/gpt-oss-120b:free', label: 'openai/gpt-oss-120b', free: true, recommended: false, note: 'OpenRouter' },
  ],
  embeddingModels: [
    { provider: 'google', model: 'gemini-embedding-001', label: 'Gemini Embedding 001', free: false, recommended: true, note: '推荐' },
    {
      provider: 'openrouter',
      model: 'openai/text-embedding-3-small',
      label: 'openai/text-embedding-3-small',
      free: false,
      recommended: false,
      note: 'OpenRouter',
    },
  ],
};

describe('SettingsPage', () => {
  it('auto-saves settings and keeps model labels free of free wording', async () => {
    const save = vi.fn(async (payload: SettingsUpdateRequest) => ({
      ...settings,
      llm: { ...settings.llm, provider: payload.llm.provider, model: payload.llm.model },
      rag: payload.rag,
    }));
    const test = vi.fn();
    render(
      <SettingsPage
        settingsApi={{
          get: vi.fn(async () => settings),
          models: vi.fn(async () => models),
          save,
          test,
        }}
      />,
    );

    expect(await screen.findByRole('heading', { name: '系统设置' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /保存设置/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /系统状态/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Google AI Studio/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /OpenRouter/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/API Key/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /OpenRouter/ }));
    expect(screen.getByRole('option', { name: 'openai/gpt-oss-120b' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /free/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ llm: expect.objectContaining({ provider: 'openrouter', model: 'openai/gpt-oss-120b:free' }) }));
    });
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('已自动保存');
    expect(toast).toHaveClass('settings-toast');
    expect(toast).toHaveAttribute('data-placement', 'top-center');
  });

  it('dismisses transient status messages without moving settings layout', async () => {
    const save = vi.fn(async (payload: SettingsUpdateRequest) => ({
      ...settings,
      llm: { ...settings.llm, provider: payload.llm.provider, model: payload.llm.model },
      rag: payload.rag,
    }));
    render(
      <SettingsPage
        settingsApi={{
          get: vi.fn(async () => settings),
          models: vi.fn(async () => models),
          save,
          test: vi.fn(),
        }}
      />,
    );

    expect(await screen.findByRole('heading', { name: '系统设置' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /OpenRouter/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(await screen.findByRole('status')).toHaveTextContent('已自动保存');

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    }, { timeout: 4200 });
  }, 5000);

  it('tests LLM connection only from the service status panel', async () => {
    const test = vi.fn(async () => ({
      kind: 'status',
      connected: true,
      message: '运行时配置已读取。',
      llmModel: 'gemini-3.1-flash-lite',
      embeddingModel: 'gemini-embedding-001',
    }));

    render(
      <SettingsPage
        settingsApi={{
          get: vi.fn(async () => settings),
          models: vi.fn(async () => models),
          save: vi.fn(),
          test,
        }}
      />,
    );

    expect(await screen.findByText('服务连接状态')).toBeInTheDocument();
    expect(screen.getByText('LLM 服务（Gemini 3.1 Flash Lite）')).toBeInTheDocument();
    expect(screen.queryByText('连接测试')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '测试连接' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /测试 LLM/ }));

    await waitFor(() => {
      expect(test).toHaveBeenCalledWith('llm', expect.objectContaining({ rag: expect.objectContaining({ topK: 5 }) }));
    });
    expect(await screen.findByText('运行时配置已读取。')).toBeInTheDocument();
  });

  it('saves text and numeric settings on blur', async () => {
    const save = vi.fn(async (payload: SettingsUpdateRequest) => ({
      ...settings,
      llm: { ...settings.llm, ...payload.llm },
      rag: payload.rag,
    }));

    render(
      <SettingsPage
        settingsApi={{
          get: vi.fn(async () => settings),
          models: vi.fn(async () => models),
          save,
          test: vi.fn(),
        }}
      />,
    );

    const temperature = await screen.findByLabelText('Temperature');
    fireEvent.change(temperature, { target: { value: '0.35' } });
    expect(save).not.toHaveBeenCalled();
    fireEvent.blur(temperature);

    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(expect.objectContaining({ llm: expect.objectContaining({ temperature: 0.35 }) }));
    });
  });
});
