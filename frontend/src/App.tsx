import {
  BotMessageSquare,
  Box,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Database,
  Eye,
  FileText,
  Home,
  MessageCircle,
  MoreVertical,
  PieChart,
  Search,
  SearchCheck,
  Settings,
  Sparkles,
  UploadCloud,
} from 'lucide-react';
import { images } from './assets/images';

const navItems = [
  { label: '工作台', icon: Home, active: true },
  { label: '文档中心', icon: FileText },
  { label: '上传文档', icon: UploadCloud },
  { label: '文档问答', icon: MessageCircle },
  { label: '对话历史', icon: BotMessageSquare },
  { label: '系统设置', icon: Settings },
];

const stats = [
  {
    label: '文档总数',
    value: '128',
    unit: '份',
    metaLabel: '较上周',
    trend: '↑ 12.5%',
    icon: FileText,
    tone: 'blue',
  },
  {
    label: '已解析文档',
    value: '112',
    unit: '份',
    metaLabel: '解析成功率',
    trend: '87.5%',
    icon: CheckCircle2,
    tone: 'green',
  },
  {
    label: '对话总数',
    value: '362',
    unit: '次',
    metaLabel: '较上周',
    trend: '↑ 18.3%',
    icon: BotMessageSquare,
    tone: 'purple',
  },
  {
    label: '存储使用量',
    value: '2.48',
    unit: 'GB',
    metaLabel: '总量 10 GB',
    trend: '',
    icon: PieChart,
    tone: 'orange',
  },
];

const documents = [
  {
    name: '《深度学习原理与实践》第3章.pdf',
    type: 'PDF',
    size: '12.4 MB',
    uploadedAt: '2024-05-20 14:32',
    status: '已完成',
    fileTone: 'pdf',
  },
  {
    name: '自然语言处理综述.docx',
    type: 'DOCX',
    size: '3.2 MB',
    uploadedAt: '2024-05-20 11:08',
    status: '已完成',
    fileTone: 'word',
  },
  {
    name: '实验记录与结果分析.txt',
    type: 'TXT',
    size: '1.2 MB',
    uploadedAt: '2024-05-18 09:15',
    status: '已完成',
    fileTone: 'txt',
  },
];

const processSteps = [
  { label: '上传文档', detail: '支持多种格式文档上传', icon: CloudUpload, tone: 'blue' },
  { label: '文本解析', detail: '提取文档中的文本内容', icon: FileText, tone: 'cyan' },
  { label: '文本分块', detail: '将长文本切分为语义块', icon: Box, tone: 'green' },
  { label: '向量化', detail: '生成向量并存储到向量库', icon: Database, tone: 'purple' },
  { label: '检索问答', detail: '检索相关内容并生成答案', icon: SearchCheck, tone: 'blue' },
];

const activities = [
  { label: '上传了文档《深度学习原理与实践》第3章.pdf', time: '2024-05-20 14:32', tone: 'blue' },
  { label: '文档《自然语言处理综述.docx》解析完成', time: '2024-05-20 11:10', tone: 'green' },
  { label: '与文档《深度学习原理与实践》进行了问答', time: '2024-05-20 10:45', tone: 'purple' },
  { label: '向量库更新完成，新增 1,245 个向量', time: '2024-05-19 18:22', tone: 'orange' },
];

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={images.brandLogo} alt="RAG 智能文档问答 logo" />
          <span>RAG 智能文档问答</span>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map(({ label, icon: Icon, active }) => (
            <button className={active ? 'nav-item active' : 'nav-item'} key={label}>
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="security-card">
          <div>
            <strong>企业级安全防护</strong>
            <p>数据加密存储，访问可控可审计</p>
            <a href="#security">了解更多</a>
          </div>
          <img src={images.illustrations.securityCard} alt="" />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <label className="search-box">
            <Search size={22} />
            <input placeholder="搜索文档、对话或关键词..." />
            <span className="shortcut">⌘ K</span>
          </label>
          <div className="user-chip">
            <img src={images.userAvatar} alt="" />
            <span>张同学</span>
            <ChevronRight size={16} />
          </div>
        </header>

        <section className="hero-section">
          <div>
            <h1>
              文档工作台
              <Sparkles size={24} />
            </h1>
            <p>欢迎回来！在这里管理您的文档资源，发起智能问答，获取精准知识洞察。</p>
          </div>
        </section>

        <section className="stats-grid" aria-label="统计概览">
          {stats.map(({ icon: Icon, ...item }) => (
            <article className={`stat-card ${item.tone}`} key={item.label}>
              <div className="stat-copy">
                <span>{item.label}</span>
                <div className="stat-value">
                  <strong>{item.value}</strong>
                  <em>{item.unit}</em>
                </div>
                <small>
                  {item.metaLabel}
                  {item.trend ? <b className="trend-value"> {item.trend}</b> : null}
                </small>
              </div>
              <div className="stat-icon" data-testid="stat-icon">
                <Icon size={34} />
              </div>
            </article>
          ))}
        </section>

        <section className="content-grid">
          <article className="panel documents-panel">
            <div className="panel-heading">
              <h2>最近上传的文档</h2>
              <a href="#documents">
                查看全部
                <ChevronRight size={16} />
              </a>
            </div>
            <div className="document-row header">
              <span>文件名称</span>
              <span>类型</span>
              <span>大小</span>
              <span>上传时间</span>
              <span>状态</span>
              <span>操作</span>
            </div>
            {documents.map((document) => (
              <div className="document-row" key={document.name}>
                <span className="file-cell">
                  <i className={`file-badge ${document.fileTone}`}>{document.type}</i>
                  {document.name}
                </span>
                <span>{document.type}</span>
                <span>{document.size}</span>
                <span>{document.uploadedAt}</span>
                <mark>{document.status}</mark>
                <span className="row-actions">
                  <Eye size={18} />
                  <MoreVertical size={18} />
                </span>
              </div>
            ))}
          </article>

          <article className="panel actions-panel">
            <h2>快捷操作</h2>
            <button>
              <CloudUpload size={22} />
              <span>
                上传新文档
                <small>PDF / TXT / Word</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button>
              <MessageCircle size={22} />
              <span>
                新建对话
                <small>基于知识库发起智能问答</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button>
              <Database size={22} />
              <span>
                查看向量库
                <small>浏览文档向量与索引信息</small>
              </span>
              <ChevronRight size={18} />
            </button>
          </article>

          <article className="panel process-panel" aria-label="RAG 检索增强生成流程">
            <h2>RAG 检索增强生成流程</h2>
            <ol className="process-list">
              {processSteps.map(({ icon: Icon, ...step }, index) => (
                <li className={`process-step ${step.tone}`} key={step.label}>
                  <div className="process-icon">
                    <Icon size={31} />
                  </div>
                  <span className="step-number">{index + 1}</span>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
          </article>

          <article className="panel activity-panel">
            <div className="panel-heading">
              <h2>最近动态</h2>
              <a href="#activity">
                查看全部
                <ChevronRight size={16} />
              </a>
            </div>
            <ol>
              {activities.map((activity) => (
                <li className={activity.tone} key={activity.label}>
                  <span />
                  <div>
                    <strong>{activity.label}</strong>
                    <time>{activity.time}</time>
                  </div>
                </li>
              ))}
            </ol>
          </article>
        </section>
      </main>
    </div>
  );
}

export default App;
