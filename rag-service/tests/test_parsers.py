import subprocess
from io import BytesIO
from pathlib import Path

import pytest

from rag_service.documents.parsers import (
    DocDocumentParser,
    DocxDocumentParser,
    PdfDocumentParser,
    TxtDocumentParser,
    create_default_parser_registry,
)


def test_txt_parser_detects_non_utf8_encoding() -> None:
    content = "自然语言处理综述".encode("gb18030")

    parsed = TxtDocumentParser().parse(content, source_name="notes.txt", format_name="txt")

    assert parsed.text == "自然语言处理综述"
    assert parsed.format == "txt"
    assert parsed.source_name == "notes.txt"


def test_docx_parser_extracts_paragraphs() -> None:
    from docx import Document

    buffer = BytesIO()
    document = Document()
    document.add_paragraph("第一段")
    document.add_paragraph("第二段")
    document.save(buffer)

    parsed = DocxDocumentParser().parse(buffer.getvalue(), source_name="自然语言处理综述.docx", format_name="docx")

    assert parsed.text == "第一段\n第二段"
    assert parsed.format == "docx"


def test_pdf_parser_uses_pypdf_reader(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakePage:
        def __init__(self, text: str) -> None:
            self._text = text

        def extract_text(self) -> str:
            return self._text

    class FakeReader:
        def __init__(self, _: BytesIO) -> None:
            self.pages = [FakePage("第一页"), FakePage("第二页")]

    monkeypatch.setattr("rag_service.documents.parsers.PdfReader", FakeReader)

    parsed = PdfDocumentParser().parse(b"%PDF", source_name="chapter.pdf", format_name="pdf")

    assert parsed.text == "第一页\n\n第二页"
    assert parsed.metadata["page_count"] == 2


def test_doc_parser_converts_with_libreoffice_using_argument_array(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_args: list[str] = []

    def fake_run(args: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        captured_args.extend(args)
        output_dir = Path(args[args.index("--outdir") + 1])
        (output_dir / "legacy.txt").write_text("旧版 Word 文本", encoding="utf-8")
        return subprocess.CompletedProcess(args=args, returncode=0, stdout="", stderr="")

    monkeypatch.setattr("rag_service.documents.parsers.subprocess.run", fake_run)

    parsed = DocDocumentParser(timeout_seconds=1).parse(b"doc-bytes", source_name="legacy.doc", format_name="doc")

    assert parsed.text == "旧版 Word 文本"
    assert captured_args[:5] == ["libreoffice", "--headless", "--convert-to", "txt:Text (encoded):UTF8", "--outdir"]


def test_default_parser_registry_handles_all_supported_formats() -> None:
    registry = create_default_parser_registry()

    for format_name in ("pdf", "txt", "docx", "doc"):
        assert registry.get_parser(format_name).can_parse(format_name)
