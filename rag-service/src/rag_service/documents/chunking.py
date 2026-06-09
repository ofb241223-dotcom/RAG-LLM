from dataclasses import dataclass


@dataclass(frozen=True)
class TextChunk:
    text: str
    chunk_index: int
    start: int
    end: int
    page: int | None = None


def split_text(text: str, *, window_size: int = 500, overlap: int = 80) -> list[TextChunk]:
    if window_size <= 0:
        raise ValueError("window_size must be positive.")
    if overlap < 0 or overlap >= window_size:
        raise ValueError("overlap must be non-negative and smaller than window_size.")

    stripped = text.strip()
    if not stripped:
        return []

    chunks: list[TextChunk] = []
    start = 0
    while start < len(stripped):
        end = min(start + window_size, len(stripped))
        chunk_text = stripped[start:end].strip()
        if chunk_text:
            chunks.append(
                TextChunk(
                    text=chunk_text,
                    chunk_index=len(chunks),
                    start=start,
                    end=end,
                )
            )
        if end >= len(stripped):
            break
        start = end - overlap

    return chunks
