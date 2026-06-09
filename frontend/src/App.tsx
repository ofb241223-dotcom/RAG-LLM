import { ChevronRight, FileText, Home, MessageCircle, Search, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { images } from './assets/images';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DocumentsPage } from './features/documents/DocumentsPage';
import { ChatPage } from './features/chat/ChatPage';
import { UploadPage } from './features/upload/UploadPage';

type ViewId = 'dashboard' | 'documents' | 'upload' | 'chat';

const navItems = [
  { id: 'dashboard', label: '工作台', icon: Home },
  { id: 'documents', label: '文档中心', icon: FileText },
  { id: 'upload', label: '上传文档', icon: UploadCloud },
  { id: 'chat', label: '文档问答', icon: MessageCircle },
] satisfies Array<{ id: ViewId; label: string; icon: typeof Home }>;

function renderView(activeView: ViewId, setActiveView: (view: ViewId) => void) {
  if (activeView === 'documents') return <DocumentsPage onNavigate={setActiveView} />;
  if (activeView === 'upload') return <UploadPage />;
  if (activeView === 'chat') return <ChatPage />;
  return <DashboardPage onNavigate={setActiveView} />;
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={images.brandLogo} alt="RAG 智能文档问答 logo" />
          <span>RAG 智能文档问答</span>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button className={activeView === id ? 'nav-item active' : 'nav-item'} key={id} type="button" onClick={() => setActiveView(id)}>
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

        {renderView(activeView, setActiveView)}
      </main>
    </div>
  );
}

export default App;
