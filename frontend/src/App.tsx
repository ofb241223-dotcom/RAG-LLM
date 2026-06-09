import {
  Bell,
  BotMessageSquare,
  ChevronRight,
  CloudUpload,
  Database,
  FileText,
  Home,
  MessageCircle,
  Search,
  Settings,
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
  { label: '文档总数', value: '128', meta: '较上周 ↑ 12.5%' },
  { label: '已解析文档', value: '112', meta: '解析成功率 87.5%' },
  { label: '对话总数', value: '362', meta: '较上周 ↑ 18.3%' },
];

const supportedFormats = ['PDF', 'TXT', 'Word'];

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
          </label>
          <button className="icon-button" aria-label="通知">
            <Bell size={22} />
            <span className="badge">3</span>
          </button>
          <div className="user-chip">
            <img src={images.userAvatar} alt="" />
            <span>张同学</span>
          </div>
        </header>

        <section className="hero-section">
          <div>
            <h1>文档工作台</h1>
            <p>管理知识文档、追踪解析流程，并基于当前文档发起可信问答。</p>
          </div>
          <button className="primary-action">
            <CloudUpload size={20} />
            上传文档
          </button>
        </section>

        <section className="stats-grid" aria-label="统计概览">
          {stats.map((item) => (
            <article className="stat-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.meta}</small>
            </article>
          ))}
          <article className="stat-card format-card">
            <span>支持格式</span>
            <strong>{supportedFormats.join(' / ')}</strong>
            <small>支持 .pdf、.txt、.docx、.doc</small>
          </article>
        </section>

        <section className="content-grid">
          <article className="panel documents-panel">
            <div className="panel-heading">
              <h2>最近上传的文档</h2>
              <a href="#documents">查看全部</a>
            </div>
            <div className="document-row header">
              <span>文件名称</span>
              <span>类型</span>
              <span>状态</span>
            </div>
            {[
              ['《深度学习原理与实践》第3章.pdf', 'PDF', '已完成'],
              ['实验记录与结果分析.txt', 'TXT', '已完成'],
              ['自然语言处理综述.docx', 'Word', '解析中'],
            ].map(([name, type, status]) => (
              <div className="document-row" key={name}>
                <span>{name}</span>
                <span>{type}</span>
                <mark>{status}</mark>
              </div>
            ))}
          </article>

          <article className="panel actions-panel">
            <h2>快捷操作</h2>
            <button>
              <CloudUpload size={22} />
              上传新文档
              <ChevronRight size={18} />
            </button>
            <button>
              <MessageCircle size={22} />
              新建对话
              <ChevronRight size={18} />
            </button>
            <button>
              <Database size={22} />
              查看向量库
              <ChevronRight size={18} />
            </button>
          </article>
        </section>
      </main>
    </div>
  );
}

export default App;
