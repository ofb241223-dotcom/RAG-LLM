PDF = "pdf"
TXT = "txt"
DOCX = "docx"
DOC = "doc"

SUPPORTED_FORMATS = (PDF, TXT, DOCX, DOC)


def normalize_format(format_name: str) -> str:
    return format_name.lower().lstrip(".")


def is_supported_format(format_name: str) -> bool:
    return normalize_format(format_name) in SUPPORTED_FORMATS


def validate_format(format_name: str) -> str:
    normalized = normalize_format(format_name)
    if normalized not in SUPPORTED_FORMATS:
        supported = ", ".join(SUPPORTED_FORMATS)
        raise ValueError(f"Unsupported document format: {format_name!r}. Supported formats: {supported}.")
    return normalized
