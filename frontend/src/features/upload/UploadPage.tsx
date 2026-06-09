import { UploadQueue } from './UploadQueue';

export function UploadPage() {
  return (
    <section className="feature-page">
      <div className="page-heading">
        <div>
          <h1>上传文档</h1>
          <p>支持 PDF、TXT、DOCX、DOC。上传完成后会自动进入解析和向量化流程。</p>
        </div>
      </div>
      <UploadQueue />
    </section>
  );
}
