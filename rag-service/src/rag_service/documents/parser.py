from dataclasses import dataclass, field
from typing import Protocol

from rag_service.documents.formats import SUPPORTED_FORMATS, validate_format


@dataclass(frozen=True)
class ParsedDocument:
    text: str
    format: str
    source_name: str
    metadata: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        validate_format(self.format)


class DocumentParser(Protocol):
    supported_formats: tuple[str, ...]

    def can_parse(self, format_name: str) -> bool:
        """Return true when this parser handles the normalized document format."""

    def parse(self, content: bytes, *, source_name: str, format_name: str) -> ParsedDocument:
        """Extract plain text from document bytes."""


class ParserRegistry:
    def __init__(self, parsers: tuple[DocumentParser, ...] = ()) -> None:
        self._parsers = list(parsers)

    def register(self, parser: DocumentParser) -> None:
        self._parsers.append(parser)

    def get_parser(self, format_name: str) -> DocumentParser:
        normalized = validate_format(format_name)
        for parser in self._parsers:
            if parser.can_parse(normalized):
                return parser
        raise NotImplementedError(f"No parser registered for format: {normalized}")


__all__ = [
    "DocumentParser",
    "ParsedDocument",
    "ParserRegistry",
    "SUPPORTED_FORMATS",
]
