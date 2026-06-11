import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Database, FileText, Info, Layers, Play, Settings, ShieldCheck, SlidersHorizontal, UploadCloud } from 'lucide-react';
import { settingsApi as defaultSettingsApi, type ModelOption, type SettingsResponse, type SettingsUpdateRequest } from '../../api/settings';

interface GuideItem {
  label: string;
  value: string;
  icon: ReactNode;
  tone: string;
}

const guideItems: GuideItem[] = [
  {
    label: '支持格式',
    value: 'PDF / TXT / Word',
    icon: <FileText size={18} />,
    tone: '#ef4444',
  },
  {
    label: '单文件大小',
    value: '最大 200MB',
    icon: <UploadCloud size={18} />,
    tone: '#2f6cff',
  },
  {
    label: '单次上传数量',
    value: '最多 20 个文件',
    icon: <Layers size={18} />,
    tone: '#18b978',
  },
  {
    label: '并行上传',
    value: '默认 3 个任务同时处理',
    icon: <ShieldCheck size={18} />,
    tone: '#8b5cf6',
  },
];

interface UploadSidebarProps {
  settingsApi?: typeof defaultSettingsApi;
}

function toPayload(settings: SettingsResponse): SettingsUpdateRequest {
  return {
    llm: settings.llm,
    embedding: {
      provider: settings.embedding.provider,
      model: settings.embedding.model,
      batchSize: settings.embedding.batchSize,
    },
    vectorStore: settings.vectorStore,
    rag: settings.rag,
  };
}

function modelLabel(option: ModelOption): string {
  return option.label.replace(/:free$/u, '');
}

export function UploadSidebar({ settingsApi = defaultSettingsApi }: UploadSidebarProps) {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [embeddingModels, setEmbeddingModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([settingsApi.get(), settingsApi.models()])
      .then(([nextSettings, models]) => {
        if (!alive) return;
        setSettings(nextSettings);
        setEmbeddingModels(models.embeddingModels);
      })
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : '解析配置加载失败');
      });
    return () => {
      alive = false;
    };
  }, [settingsApi]);

  const save = async (nextSettings = settings) => {
    if (!nextSettings) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await settingsApi.save(toPayload(nextSettings));
      setSettings(saved);
      setMessage('解析配置已保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '解析配置保存失败');
    } finally {
      setSaving(false);
    }
  };

  const updateSettings = (updater: (current: SettingsResponse) => SettingsResponse, autosave = false) => {
    if (!settings) return;
    const nextSettings = updater(settings);
    setSettings(nextSettings);
    if (autosave) void save(nextSettings);
  };

  return (
    <aside aria-label="上传说明与解析配置" style={styles.sidebar}>
      <section className="panel" aria-labelledby="upload-guide-title" style={styles.card}>
        <header style={styles.cardHeader}>
          <h2 id="upload-guide-title" style={styles.title}>
            上传说明
          </h2>
          <Info aria-hidden="true" size={15} style={styles.headerIcon} />
        </header>

        <div style={styles.guideList}>
          {guideItems.map((item) => (
            <article key={item.label} style={styles.guideItem}>
              <span aria-hidden="true" style={{ ...styles.guideIcon, background: item.tone }}>
                {item.icon}
              </span>
              <div style={styles.guideText}>
                <strong>{item.label}</strong>
                <span>{item.value}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel" aria-labelledby="parse-config-title" style={styles.card}>
        <header style={styles.cardHeader}>
          <h2 id="parse-config-title" style={styles.title}>
            解析配置
          </h2>
          <Settings aria-hidden="true" size={15} style={styles.headerIcon} />
        </header>

        <form style={styles.configForm} onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>
              分块大小
              <Info aria-hidden="true" size={14} />
            </span>
            <span style={styles.inputWrap}>
              <input
                aria-label="分块大小"
                min={100}
                max={4000}
                style={styles.input}
                type="number"
                value={settings?.rag.chunkSize ?? 500}
                onBlur={() => void save()}
                onChange={(event) => updateSettings((current) => ({ ...current, rag: { ...current.rag, chunkSize: Number(event.target.value) } }))}
              />
              <span style={styles.unit}>字符</span>
            </span>
          </label>

          <label style={styles.field}>
            <span style={styles.fieldLabel}>
              重叠大小
              <Info aria-hidden="true" size={14} />
            </span>
            <span style={styles.inputWrap}>
              <input
                aria-label="重叠大小"
                min={0}
                max={2000}
                style={styles.input}
                type="number"
                value={settings?.rag.chunkOverlap ?? 80}
                onBlur={() => void save()}
                onChange={(event) => updateSettings((current) => ({ ...current, rag: { ...current.rag, chunkOverlap: Number(event.target.value) } }))}
              />
              <span style={styles.unit}>字符</span>
            </span>
          </label>

          <label style={styles.fieldFull}>
            <span style={styles.fieldLabel}>
              <SlidersHorizontal aria-hidden="true" size={14} />
              Embedding 模型
            </span>
            <span style={styles.selectWrap}>
              <select
                aria-label="Embedding 模型"
                disabled={!settings}
                style={styles.select}
                value={settings?.embedding.model ?? ''}
                onChange={(event) => {
                  const option = embeddingModels.find((item) => item.model === event.target.value);
                  updateSettings((current) => ({
                    ...current,
                    embedding: {
                      ...current.embedding,
                      provider: option?.provider ?? current.embedding.provider,
                      model: event.target.value,
                    },
                  }), true);
                }}
              >
                {embeddingModels.map((option) => (
                  <option key={`${option.provider}:${option.model}`} value={option.model}>
                    {modelLabel(option)}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={16} style={styles.chevron} />
            </span>
          </label>

          <label style={styles.fieldFull}>
            <span style={styles.fieldLabel}>
              <Database aria-hidden="true" size={14} />
              向量数据库
            </span>
            <span style={styles.selectWrap}>
              <select
                aria-label="向量数据库"
                disabled={!settings}
                style={styles.select}
                value={settings?.vectorStore.type ?? 'chroma'}
                onChange={(event) => updateSettings((current) => ({ ...current, vectorStore: { ...current.vectorStore, type: event.target.value } }), true)}
              >
                <option value="chroma">Chroma</option>
              </select>
              <ChevronDown aria-hidden="true" size={16} style={styles.chevron} />
            </span>
          </label>

          <button className="primary-button" disabled={!settings || saving} style={styles.parseButton} type="submit">
            <Play aria-hidden="true" fill="currentColor" size={15} />
            {saving ? '正在保存' : '保存解析配置'}
          </button>
        </form>

        <p style={styles.footerHint}>{message ?? '上传完成后将自动开始解析'}</p>
      </section>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  sidebar: {
    display: 'grid',
    gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 14,
    alignContent: 'stretch',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
  },
  card: {
    display: 'grid',
    gap: 15,
    minHeight: 0,
    padding: '18px 20px',
    margin: 0,
    borderRadius: 8,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    margin: 0,
    color: '#17203a',
    fontSize: 18,
    fontWeight: 900,
    lineHeight: 1.2,
  },
  headerIcon: {
    color: '#92a0ba',
  },
  guideList: {
    display: 'grid',
    gap: 14,
  },
  guideItem: {
    display: 'grid',
    gridTemplateColumns: '36px minmax(0, 1fr)',
    alignItems: 'center',
    gap: 14,
  },
  guideIcon: {
    display: 'inline-grid',
    placeItems: 'center',
    width: 32,
    height: 32,
    color: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 18px rgba(44, 101, 255, 0.12)',
  },
  guideText: {
    display: 'grid',
    gap: 4,
    minWidth: 0,
    color: '#17203a',
    fontSize: 14,
    lineHeight: 1.35,
  },
  configForm: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '11px 12px',
  },
  field: {
    display: 'grid',
    gap: 7,
    minWidth: 0,
  },
  fieldFull: {
    display: 'grid',
    gridColumn: '1 / -1',
    gap: 7,
    minWidth: 0,
  },
  fieldLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    color: '#53617e',
    fontSize: 13,
    fontWeight: 800,
    lineHeight: 1.3,
  },
  inputWrap: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    minHeight: 38,
    padding: '0 12px',
    background: '#ffffff',
    border: '1px solid #dce5f2',
    borderRadius: 8,
  },
  input: {
    width: '100%',
    minWidth: 0,
    padding: 0,
    color: '#17203a',
    background: 'transparent',
    border: 0,
    fontSize: 14,
    fontWeight: 700,
    outline: 'none',
  },
  unit: {
    color: '#7a89a6',
    fontSize: 12,
    fontWeight: 700,
  },
  selectWrap: {
    position: 'relative',
    display: 'block',
    width: '100%',
  },
  select: {
    width: '100%',
    minHeight: 40,
    padding: '0 38px 0 13px',
    color: '#17203a',
    background: '#ffffff',
    border: '1px solid #dce5f2',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    outline: 'none',
    appearance: 'none',
  },
  chevron: {
    position: 'absolute',
    top: '50%',
    right: 12,
    color: '#7a89a6',
    pointerEvents: 'none',
    transform: 'translateY(-50%)',
  },
  parseButton: {
    gridColumn: '1 / -1',
    width: '100%',
    minHeight: 42,
    marginTop: 6,
    fontSize: 15,
  },
  footerHint: {
    margin: '0 0 2px',
    color: '#8a97b2',
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
  },
};
