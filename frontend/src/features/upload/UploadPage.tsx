import { UploadQueue } from './UploadQueue';
import { UploadSidebar } from './UploadSidebar';
import type { DocumentDto } from '../../types/document';

interface UploadPageProps {
  onOpenDocumentDetail?: (document: DocumentDto) => void;
}

export function UploadPage({ onOpenDocumentDetail }: UploadPageProps) {
  return (
    <section className="feature-page upload-page">
      <div className="page-heading">
        <div>
          <h1>上传文档</h1>
          <p>上传本地文档，系统将自动解析并生成可检索的知识库。</p>
        </div>
      </div>
      <div className="upload-layout">
        <UploadQueue onOpenDocumentDetail={onOpenDocumentDetail} />
        <UploadSidebar />
      </div>
    </section>
  );
}
