import pytest

from rag_service.documents.formats import (
    SUPPORTED_FORMATS,
    is_supported_format,
    validate_format,
)


@pytest.mark.parametrize("format_name", ["pdf", "txt", "docx", "doc", "xlsx", "xls"])
def test_supported_formats_are_accepted(format_name: str) -> None:
    assert format_name in SUPPORTED_FORMATS
    assert is_supported_format(format_name)
    assert validate_format(format_name) == format_name


@pytest.mark.parametrize("format_name", ["png", "md", "", "pdfx"])
def test_unsupported_formats_are_rejected(format_name: str) -> None:
    assert not is_supported_format(format_name)
    with pytest.raises(ValueError):
        validate_format(format_name)
