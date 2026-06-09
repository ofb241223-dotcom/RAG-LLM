from __future__ import annotations

import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from charset_normalizer import from_bytes
from docx import Document
from pypdf import PdfReader

from rag_service.documents.formats import DOC, DOCX, PDF, TXT, normalize_format
from rag_service.documents.parser import DocumentParser, ParsedDocument, ParserRegistry


class DocumentParsingError(ValueError):
    """Raised when bytes have the right extension but cannot be parsed."""


class TxtDocumentParser:
    supported_formats = (TXT,)

    def can_parse(self, format_name: str) -> bool:
        return normalize_format(format_name) in self.supported_formats

    def parse(self, content: bytes, *, source_name: str, format_name: str) -> ParsedDocument:
        matches = from_bytes(content)
        match = next((candidate for candidate in matches if candidate.language == "Chinese"), None)
        if match is None:
            match = matches.best()
        text = str(match) if match is not None else content.decode("utf-8", errors="replace")
        return ParsedDocument(text=text.strip(), format=format_name, source_name=source_name)


class PdfDocumentParser:
    supported_formats = (PDF,)

    def can_parse(self, format_name: str) -> bool:
        return normalize_format(format_name) in self.supported_formats

    def parse(self, content: bytes, *, source_name: str, format_name: str) -> ParsedDocument:
        try:
            reader = PdfReader(BytesIO(content))
            page_text = [(page.extract_text() or "").strip() for page in reader.pages]
        except Exception as error:  # pypdf raises several parser-specific exceptions.
            raise DocumentParsingError(f"Failed to parse PDF: {source_name}") from error

        text = "\n\n".join(part for part in page_text if part)
        return ParsedDocument(
            text=text.strip(),
            format=format_name,
            source_name=source_name,
            metadata={"page_count": len(reader.pages)},
        )


class DocxDocumentParser:
    supported_formats = (DOCX,)

    def can_parse(self, format_name: str) -> bool:
        return normalize_format(format_name) in self.supported_formats

    def parse(self, content: bytes, *, source_name: str, format_name: str) -> ParsedDocument:
        try:
            document = Document(BytesIO(content))
        except Exception as error:
            raise DocumentParsingError(f"Failed to parse DOCX: {source_name}") from error

        paragraphs = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
        return ParsedDocument(text="\n".join(paragraphs), format=format_name, source_name=source_name)


class DocDocumentParser:
    supported_formats = (DOC,)

    def __init__(self, *, timeout_seconds: int = 30) -> None:
        self.timeout_seconds = timeout_seconds

    def can_parse(self, format_name: str) -> bool:
        return normalize_format(format_name) in self.supported_formats

    def parse(self, content: bytes, *, source_name: str, format_name: str) -> ParsedDocument:
        source_path = Path(source_name)
        safe_name = source_path.name or "document.doc"
        if not safe_name.lower().endswith(".doc"):
            safe_name = f"{source_path.stem or 'document'}.doc"

        with tempfile.TemporaryDirectory(prefix="rag-doc-") as tmpdir:
            tmpdir_path = Path(tmpdir)
            input_path = tmpdir_path / safe_name
            input_path.write_bytes(content)

            args = [
                "libreoffice",
                "--headless",
                "--convert-to",
                "txt:Text (encoded):UTF8",
                "--outdir",
                str(tmpdir_path),
                str(input_path),
            ]
            try:
                result = subprocess.run(
                    args,
                    capture_output=True,
                    text=True,
                    timeout=self.timeout_seconds,
                    check=False,
                )
            except FileNotFoundError as error:
                raise DocumentParsingError("LibreOffice is required to parse .doc files.") from error
            except subprocess.TimeoutExpired as error:
                raise DocumentParsingError(f"LibreOffice timed out while parsing DOC: {source_name}") from error

            if result.returncode != 0:
                detail = result.stderr.strip() or result.stdout.strip()
                raise DocumentParsingError(f"LibreOffice failed to parse DOC: {detail}")

            output_path = input_path.with_suffix(".txt")
            if not output_path.exists():
                candidates = list(tmpdir_path.glob("*.txt"))
                if not candidates:
                    raise DocumentParsingError(f"LibreOffice did not produce text for DOC: {source_name}")
                output_path = candidates[0]

            return ParsedDocument(
                text=output_path.read_text(encoding="utf-8", errors="replace").strip(),
                format=format_name,
                source_name=source_name,
            )


def create_default_parser_registry() -> ParserRegistry:
    return ParserRegistry(
        (
            TxtDocumentParser(),
            PdfDocumentParser(),
            DocxDocumentParser(),
            DocDocumentParser(),
        )
    )


__all__ = [
    "DocDocumentParser",
    "DocxDocumentParser",
    "DocumentParsingError",
    "PdfDocumentParser",
    "TxtDocumentParser",
    "create_default_parser_registry",
]
