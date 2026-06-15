import { ChevronRight, FileText, History, Home, MessageCircle, Settings, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { images } from './assets/images';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DocumentDetailPage } from './features/documents/DocumentDetailPage';
import { DocumentsPage } from './features/documents/DocumentsPage';
import { ChatHistoryPage } from './features/chat/ChatHistoryPage';
import { DocumentChatPage } from './features/chat/DocumentChatPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { UploadPage } from './features/upload/UploadPage';
import type { DocumentDto } from './types/document';

type MainViewId = 'dashboard' | 'documents' | 'upload' | 'chat' | 'history' | 'settings';
type AppView =
  | { id: MainViewId; initialDocumentId?: number }
  | {
      id: 'document-detail';
      document: DocumentDto;
      documentId: number;
      returnTo: MainViewId;
    };

const navItems = [
  { id: 'dashboard', label: '工作台', icon: Home },
  { id: 'documents', label: '文档中心', icon: FileText },
  { id: 'upload', label: '上传文档', icon: UploadCloud },
  { id: 'chat', label: '文档问答', icon: MessageCircle },
  { id: 'history', label: '对话历史', icon: History },
  { id: 'settings', label: '系统设置', icon: Settings },
] satisfies Array<{ id: MainViewId; label: string; icon: typeof Home }>;

function getActiveNavId(activeView: AppView): MainViewId {
  return activeView.id === 'document-detail' ? activeView.returnTo : activeView.id;
}

function renderView(
  activeView: AppView,
  setMainView: (view: MainViewId) => void,
  openDocumentDetail: (document: DocumentDto, returnTo: MainViewId) => void,
  openChatForDocument: (document: DocumentDto) => void,
) {
  if (activeView.id === 'documents') {
    return <DocumentsPage onNavigate={setMainView} onOpenDocumentDetail={(document) => openDocumentDetail(document, 'documents')} />;
  }
  if (activeView.id === 'upload') {
    return <UploadPage onOpenDocumentDetail={(document) => openDocumentDetail(document, 'upload')} />;
  }
  if (activeView.id === 'chat') return <DocumentChatPage initialDocumentId={activeView.initialDocumentId} onOpenSettings={() => setMainView('settings')} />;
  if (activeView.id === 'history') return <ChatHistoryPage initialDocumentId={activeView.initialDocumentId} />;
  if (activeView.id === 'settings') return <SettingsPage />;
  if (activeView.id === 'document-detail') {
    return (
      <DocumentDetailPage
        documentId={activeView.documentId}
        initialDocument={activeView.document}
        onAskDocument={openChatForDocument}
        onBack={() => setMainView(activeView.returnTo)}
      />
    );
  }
  return <DashboardPage onNavigate={setMainView} />;
}

function App() {
  const [activeView, setActiveView] = useState<AppView>({ id: 'dashboard' });
  const activeNavId = getActiveNavId(activeView);
  const setMainView = (view: MainViewId) => setActiveView({ id: view });
  const openDocumentDetail = (document: DocumentDto, returnTo: MainViewId) => {
    setActiveView({ id: 'document-detail', documentId: document.id, document, returnTo });
  };
  const openChatForDocument = (document: DocumentDto) => {
    setActiveView({ id: 'chat', initialDocumentId: document.id });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <img src={images.brandLogo} alt="RAG 智能文档问答 logo" />
          <span>RAG 智能文档问答</span>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button className={activeNavId === id ? 'nav-item active' : 'nav-item'} key={id} type="button" onClick={() => setMainView(id)}>
              <Icon size={22} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="user-chip">
            <img src={images.userAvatar} alt="" />
            <span>科大人</span>
            <ChevronRight size={16} />
          </div>
        </header>

        {renderView(activeView, setMainView, openDocumentDetail, openChatForDocument)}
      </main>
    </div>
  );
}

export default App;
