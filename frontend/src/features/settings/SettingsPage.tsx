import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bot, CheckCircle2, Cpu, Database, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import {
  settingsApi as defaultSettingsApi,
  type EmbeddingSettings,
  type LlmSettings,
  type ModelOption,
  type RagSettings,
  type SettingsModelsResponse,
  type SettingsResponse,
  type SettingsTestResponse,
  type SettingsUpdateRequest,
  type VectorStoreSettings,
} from '../../api/settings';
import { formatDateTime } from '../chat/chatFormat';

type SettingsTab = 'llm' | 'embedding' | 'rag';
type TestKind = 'status' | 'llm' | 'embedding';

interface SettingsPageProps {
  settingsApi?: typeof defaultSettingsApi;
}

interface SettingsForm {
  llm: LlmSettings;
  embedding: EmbeddingSettings;
  vectorStore: VectorStoreSettings;
  rag: RagSettings;
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_VECTOR_STORE: VectorStoreSettings = {
  type: 'chroma',
  collectionName: 'rag_documents_v1',
  persistDir: './rag_data/chroma',
};

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Bot }> = [
  { id: 'llm', label: 'LLM 配置', icon: Bot },
  { id: 'embedding', label: 'Embedding 模型', icon: Cpu },
  { id: 'rag', label: 'RAG 策略', icon: SlidersHorizontal },
];

function toForm(settings: SettingsResponse): SettingsForm {
  return {
    llm: settings.llm,
    embedding: settings.embedding,
    vectorStore: settings.vectorStore ?? DEFAULT_VECTOR_STORE,
    rag: settings.rag,
    updatedAt: settings.updatedAt,
    updatedBy: settings.updatedBy,
  };
}

function toPayload(form: SettingsForm): SettingsUpdateRequest {
  return {
    llm: {
      provider: form.llm.provider,
      model: form.llm.model,
      temperature: Number(form.llm.temperature),
      maxTokens: Number(form.llm.maxTokens),
      topP: Number(form.llm.topP),
      frequencyPenalty: Number(form.llm.frequencyPenalty),
      contextLength: Number(form.llm.contextLength),
      streamOutput: form.llm.streamOutput,
      systemPrompt: form.llm.systemPrompt,
    },
    embedding: {
      provider: form.embedding.provider,
      model: form.embedding.model,
      batchSize: Number(form.embedding.batchSize),
    },
    vectorStore: {
      type: form.vectorStore.type,
      collectionName: form.vectorStore.collectionName,
      persistDir: form.vectorStore.persistDir,
    },
    rag: {
      topK: Number(form.rag.topK),
      scoreThreshold: Number(form.rag.scoreThreshold),
      chunkSize: Number(form.rag.chunkSize),
      chunkOverlap: Number(form.rag.chunkOverlap),
      currentDocumentOnly: form.rag.currentDocumentOnly,
      showCitations: form.rag.showCitations,
    },
  };
}

function firstModelForProvider(options: ModelOption[], provider: string, fallback: string) {
  return options.find((option) => option.provider === provider && option.recommended)?.model ?? options.find((option) => option.provider === provider)?.model ?? fallback;
}

function providerOptions(options: ModelOption[]) {
  return Array.from(new Set(options.map((option) => option.provider)));
}

function providerLabel(provider: string) {
  if (provider === 'google') return 'Google AI Studio';
  if (provider === 'openrouter') return 'OpenRouter';
  return provider;
}

function displayModelName(options: ModelOption[], provider: string, model: string) {
  return options.find((option) => option.provider === provider && option.model === model)?.label ?? model.replace(/:free$/u, '');
}

function vectorStoreDisplayName(vectorStore: VectorStoreSettings) {
  return `${vectorStore.type.toUpperCase()} / ${vectorStore.collectionName}`;
}

function statusTone(lastTest: SettingsTestResponse | null, kind: TestKind): 'success' | 'error' | 'idle' {
  if (lastTest?.kind !== kind) return 'idle';
  return lastTest.connected ? 'success' : 'error';
}

export function SettingsPage({ settingsApi = defaultSettingsApi }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('llm');
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [models, setModels] = useState<SettingsModelsResponse>({ llmModels: [], embeddingModels: [] });
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testing, setTesting] = useState<TestKind | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [lastTest, setLastTest] = useState<SettingsTestResponse | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      setNotice(null);
      try {
        const [settings, modelOptions] = await Promise.all([settingsApi.get(), settingsApi.models()]);
        if (!alive) return;
        setForm(toForm(settings));
        setModels(modelOptions);
      } catch (error) {
        if (!alive) return;
        setNotice({ tone: 'error', message: error instanceof Error ? error.message : '系统设置加载失败' });
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();

    return () => {
      alive = false;
    };
  }, [settingsApi]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const llmModels = useMemo(() => models.llmModels.filter((option) => option.provider === form?.llm.provider), [form?.llm.provider, models.llmModels]);
  const embeddingModels = useMemo(
    () => models.embeddingModels.filter((option) => option.provider === form?.embedding.provider),
    [form?.embedding.provider, models.embeddingModels],
  );
  const llmDisplayName = form ? displayModelName(models.llmModels, form.llm.provider, form.llm.model) : '';
  const embeddingDisplayName = form ? displayModelName(models.embeddingModels, form.embedding.provider, form.embedding.model) : '';

  const commit = async (next: SettingsForm) => {
    setForm(next);
    setSavingState('saving');
    setNotice(null);
    try {
      const saved = await settingsApi.save(toPayload(next));
      setForm(toForm(saved));
      setSavingState('saved');
      setNotice({ tone: 'success', message: '已自动保存' });
    } catch (error) {
      setSavingState('error');
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '设置保存失败' });
    }
  };

  const saveDraft = () => {
    if (form) void commit(form);
  };

  const updateLlm = (patch: Partial<SettingsForm['llm']>, autosave = false) => {
    if (!form) return;
    const next = { ...form, llm: { ...form.llm, ...patch } };
    if (autosave) {
      void commit(next);
    } else {
      setForm(next);
    }
  };

  const updateEmbedding = (patch: Partial<SettingsForm['embedding']>, autosave = false) => {
    if (!form) return;
    const next = { ...form, embedding: { ...form.embedding, ...patch } };
    if (autosave) {
      void commit(next);
    } else {
      setForm(next);
    }
  };

  const updateVectorStore = (patch: Partial<VectorStoreSettings>, autosave = false) => {
    if (!form) return;
    const next = { ...form, vectorStore: { ...form.vectorStore, ...patch } };
    if (autosave) {
      void commit(next);
    } else {
      setForm(next);
    }
  };

  const updateRag = (patch: Partial<RagSettings>, autosave = false) => {
    if (!form) return;
    const next = { ...form, rag: { ...form.rag, ...patch } };
    if (autosave) {
      void commit(next);
    } else {
      setForm(next);
    }
  };

  const test = async (kind: TestKind) => {
    if (!form) return;
    setTesting(kind);
    setNotice(null);
    try {
      const result = await settingsApi.test(kind, toPayload(form));
      setLastTest(result);
      setNotice({ tone: result.connected ? 'success' : 'error', message: result.message });
    } catch (error) {
      setLastTest({
        kind,
        connected: false,
        message: error instanceof Error ? error.message : '连接测试失败',
        llmModel: form.llm.model,
        embeddingModel: form.embedding.model,
      });
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <section className="feature-page settings-page">
        <div className="settings-loading">正在加载系统设置...</div>
      </section>
    );
  }

  if (!form) {
    return (
      <section className="feature-page settings-page">
        <div className="settings-loading error">系统设置不可用。</div>
      </section>
    );
  }

  const saveLabel = savingState === 'saving' ? '正在保存' : savingState === 'saved' ? '自动保存完成' : savingState === 'error' ? '保存失败' : '自动保存已启用';

  return (
    <section className="feature-page settings-page">
      <div className="settings-heading">
        <div>
          <h1>系统设置</h1>
          <p>配置模型、向量库与检索策略，修改后会自动写入后端配置表。</p>
        </div>
        <span className={`settings-save-state ${savingState}`}>{saveLabel}</span>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="系统设置分类">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button className={activeTab === id ? 'active' : ''} key={id} role="tab" type="button" onClick={() => setActiveTab(id)}>
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>

      {notice ? (
        <div className={`settings-toast ${notice.tone}`} data-placement="top-center" role="status">
          {notice.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
          <span>{notice.message}</span>
        </div>
      ) : null}

      <div className="settings-grid">
        <main className="settings-main-stack">
          {activeTab === 'llm' ? (
            <>
              <section className="settings-main-card settings-model-card settings-llm-card">
                <div className="settings-section-title">
                  <Bot size={22} />
                  <span>
                    <h2>大语言模型（LLM）配置</h2>
                    <p>选择用于生成答案的大语言模型。</p>
                  </span>
                </div>

                <div className="settings-block">
                  <h3>模型来源</h3>
                  <div className="settings-option-row" role="radiogroup" aria-label="模型来源">
                    {providerOptions(models.llmModels).map((provider) => (
                      <label className={`settings-radio-card ${form.llm.provider === provider ? 'active' : ''}`} key={provider}>
                        <input
                          type="radio"
                          name="llm-provider"
                          checked={form.llm.provider === provider}
                          onChange={() => updateLlm({ provider, model: firstModelForProvider(models.llmModels, provider, form.llm.model) }, true)}
                        />
                        <span>{providerLabel(provider)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="settings-field settings-model-field">
                  模型
                  <select className="settings-select" value={form.llm.model} onChange={(event) => updateLlm({ model: event.target.value }, true)}>
                    {llmModels.map((option) => (
                      <option key={option.model} value={option.model}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

              </section>

              <section className="settings-main-card compact">
                <h2>参数设置</h2>
                <div className="settings-form-grid four">
                  <label>
                    Temperature
                    <input type="number" min={0} max={2} step={0.05} value={form.llm.temperature} onBlur={saveDraft} onChange={(event) => updateLlm({ temperature: Number(event.target.value) })} />
                  </label>
                  <label>
                    Max Tokens
                    <input type="number" min={1} value={form.llm.maxTokens} onBlur={saveDraft} onChange={(event) => updateLlm({ maxTokens: Number(event.target.value) })} />
                  </label>
                  <label>
                    Top P
                    <input type="number" min={0} max={1} step={0.05} value={form.llm.topP} onBlur={saveDraft} onChange={(event) => updateLlm({ topP: Number(event.target.value) })} />
                  </label>
                  <label>
                    频率惩罚
                    <input
                      type="number"
                      min={-2}
                      max={2}
                      step={0.05}
                      value={form.llm.frequencyPenalty}
                      onBlur={saveDraft}
                      onChange={(event) => updateLlm({ frequencyPenalty: Number(event.target.value) })}
                    />
                  </label>
                </div>
              </section>

              <div className="settings-bottom-grid">
                <section className="settings-main-card compact">
                  <h2>安全与访问</h2>
                  <div className="settings-form-grid two">
                    <label>
                      上下文长度
                      <input type="number" min={1024} value={form.llm.contextLength} onBlur={saveDraft} onChange={(event) => updateLlm({ contextLength: Number(event.target.value) })} />
                    </label>
                    <label className="settings-switch">
                      <input type="checkbox" checked={form.llm.streamOutput} onChange={(event) => updateLlm({ streamOutput: event.target.checked }, true)} />
                      <span>启用流式输出</span>
                    </label>
                  </div>
                </section>

                <section className="settings-main-card compact">
                  <h2>高级选项</h2>
                  <label className="settings-field">
                    系统提示词
                    <textarea value={form.llm.systemPrompt} onBlur={saveDraft} onChange={(event) => updateLlm({ systemPrompt: event.target.value })} />
                  </label>
                </section>
              </div>
            </>
          ) : null}

          {activeTab === 'embedding' ? (
            <>
              <section className="settings-main-card settings-model-card">
                <div className="settings-section-title">
                  <Cpu size={22} />
                  <span>
                    <h2>Embedding 模型</h2>
                    <p>用于文档分块和问题向量化；切换后已解析文档会标记为需要重新处理。</p>
                  </span>
                </div>

                <div className="settings-block">
                  <h3>模型来源</h3>
                  <div className="settings-option-row" role="radiogroup" aria-label="Embedding 模型来源">
                    {providerOptions(models.embeddingModels).map((provider) => (
                      <label className={`settings-radio-card ${form.embedding.provider === provider ? 'active' : ''}`} key={provider}>
                        <input
                          type="radio"
                          name="embedding-provider"
                          checked={form.embedding.provider === provider}
                          onChange={() => updateEmbedding({ provider, model: firstModelForProvider(models.embeddingModels, provider, form.embedding.model) }, true)}
                        />
                        <span>{providerLabel(provider)}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="settings-field settings-model-field">
                  模型
                  <select className="settings-select" value={form.embedding.model} onChange={(event) => updateEmbedding({ model: event.target.value }, true)}>
                    {embeddingModels.map((option) => (
                      <option key={option.model} value={option.model}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

              </section>

              <section className="settings-main-card compact">
                <h2>向量化配置</h2>
                <div className="settings-form-grid two">
                  <label>
                    批量向量化数量
                    <input type="number" min={1} max={50} value={form.embedding.batchSize} onBlur={saveDraft} onChange={(event) => updateEmbedding({ batchSize: Number(event.target.value) })} />
                  </label>
                  <div className="settings-metric">
                    <small>待重新处理文档</small>
                    <strong>{form.embedding.reprocessRequiredCount}</strong>
                    <span>切换模型或分块策略后会自动统计</span>
                  </div>
                </div>
              </section>
            </>
          ) : null}

          {activeTab === 'rag' ? (
            <>
              <section className="settings-main-card">
                <div className="settings-section-title">
                  <Database size={22} />
                  <span>
                    <h2>向量数据库</h2>
                    <p>当前 RAG 服务真实接入 Chroma，配置会参与后续解析和检索。</p>
                  </span>
                </div>
                <div className="settings-form-grid three">
                  <label>
                    数据库类型
                    <select className="settings-select" value={form.vectorStore.type} onChange={(event) => updateVectorStore({ type: event.target.value }, true)}>
                      <option value="chroma">Chroma</option>
                    </select>
                  </label>
                  <label>
                    集合名称
                    <input value={form.vectorStore.collectionName} onBlur={saveDraft} onChange={(event) => updateVectorStore({ collectionName: event.target.value })} />
                  </label>
                  <label>
                    存储路径
                    <input value={form.vectorStore.persistDir} onBlur={saveDraft} onChange={(event) => updateVectorStore({ persistDir: event.target.value })} />
                  </label>
                </div>
              </section>

              <section className="settings-main-card compact">
                <h2>检索参数</h2>
                <div className="settings-form-grid two">
                  <label>
                    检索 Top-K
                    <input type="number" min={1} max={20} value={form.rag.topK} onBlur={saveDraft} onChange={(event) => updateRag({ topK: Number(event.target.value) })} />
                  </label>
                  <label>
                    Score 阈值
                    <input type="number" min={0} max={1} step={0.05} value={form.rag.scoreThreshold} onBlur={saveDraft} onChange={(event) => updateRag({ scoreThreshold: Number(event.target.value) })} />
                  </label>
                </div>
              </section>

              <section className="settings-main-card compact">
                <h2>文本分块策略</h2>
                <div className="settings-form-grid two">
                  <label>
                    分块大小
                    <input type="number" min={100} max={4000} value={form.rag.chunkSize} onBlur={saveDraft} onChange={(event) => updateRag({ chunkSize: Number(event.target.value) })} />
                  </label>
                  <label>
                    重叠大小
                    <input type="number" min={0} max={2000} value={form.rag.chunkOverlap} onBlur={saveDraft} onChange={(event) => updateRag({ chunkOverlap: Number(event.target.value) })} />
                  </label>
                </div>
                <div className="settings-toggle-row">
                  <label className="settings-switch">
                    <input type="checkbox" checked={form.rag.currentDocumentOnly} onChange={(event) => updateRag({ currentDocumentOnly: event.target.checked }, true)} />
                    <span>对话仅使用当前文档上下文</span>
                  </label>
                  <label className="settings-switch">
                    <input type="checkbox" checked={form.rag.showCitations} onChange={(event) => updateRag({ showCitations: event.target.checked }, true)} />
                    <span>回答中显示引用标记</span>
                  </label>
                </div>
              </section>
            </>
          ) : null}
        </main>

        <aside className="settings-side-stack">
          <section className="settings-summary-card">
            <h2>服务连接状态</h2>
            <div className="settings-status-list">
              <article>
                <span className={`settings-status-icon ${statusTone(lastTest, 'llm')}`}>
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>LLM 服务（{llmDisplayName}）</strong>
                  <small>{lastTest?.kind === 'llm' ? (lastTest.connected ? '已连接' : '连接失败') : '等待测试'}</small>
                </div>
                <button className="secondary-button mini" disabled={testing === 'llm'} type="button" onClick={() => test('llm')}>
                  测试 LLM
                </button>
              </article>
              <article>
                <span className={`settings-status-icon ${statusTone(lastTest, 'embedding')}`}>
                  <CheckCircle2 size={16} />
                </span>
                <div>
                  <strong>Embedding 服务（{embeddingDisplayName}）</strong>
                  <small>{lastTest?.kind === 'embedding' ? (lastTest.connected ? '已连接' : '连接失败') : '等待测试'}</small>
                </div>
                <button className="secondary-button mini" disabled={testing === 'embedding'} type="button" onClick={() => test('embedding')}>
                  测试 Embedding
                </button>
              </article>
              <article>
                <span className={`settings-status-icon ${statusTone(lastTest, 'status')}`}>
                  <Database size={16} />
                </span>
                <div>
                  <strong>向量数据库（{vectorStoreDisplayName(form.vectorStore)}）</strong>
                  <small>{lastTest?.kind === 'status' && lastTest.connected ? '已读取' : '配置已读取'}</small>
                </div>
                <button className="secondary-button mini" disabled={testing === 'status'} type="button" onClick={() => test('status')}>
                  检查
                </button>
              </article>
            </div>
          </section>

          <section className="settings-summary-card">
            <h2>当前配置摘要</h2>
            <dl>
              <div>
                <dt>LLM 模型</dt>
                <dd>{llmDisplayName}</dd>
              </div>
              <div>
                <dt>Embedding 模型</dt>
                <dd>{embeddingDisplayName}</dd>
              </div>
              <div>
                <dt>向量数据库</dt>
                <dd>{vectorStoreDisplayName(form.vectorStore)}</dd>
              </div>
              <div>
                <dt>检索参数</dt>
                <dd>
                  Top-K：{form.rag.topK} · 阈值：{form.rag.scoreThreshold}
                </dd>
              </div>
              <div>
                <dt>文本分块策略</dt>
                <dd>
                  块大小：{form.rag.chunkSize} · 重叠：{form.rag.chunkOverlap}
                </dd>
              </div>
            </dl>
            <footer>
              <span>最后保存时间</span>
              <strong>{formatDateTime(form.updatedAt)}</strong>
              <span>保存人</span>
              <strong>{form.updatedBy}</strong>
            </footer>
          </section>

          <section className="settings-summary-card settings-security-card">
            <h2>
              <ShieldCheck size={18} />
              安全与访问
            </h2>
            <p>模型凭据由后端环境或后端配置读取，前端只负责选择模型和参数。</p>
            <p>切换模型后可在右侧服务连接状态中测试可用性。</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
