from dataclasses import dataclass
import re


@dataclass(frozen=True)
class TextChunk:
    text: str
    chunk_index: int
    start: int
    end: int
    page: int | None = None


def split_text(text: str, *, window_size: int = 500, overlap: int = 80, strategy: str = "fixed") -> list[TextChunk]:
    if window_size <= 0:
        raise ValueError("window_size must be positive.")
    if overlap < 0 or overlap >= window_size:
        raise ValueError("overlap must be non-negative and smaller than window_size.")

    stripped = text.strip()
    if not stripped:
        return []

    if strategy.strip().lower() in {"structured", "semantic"}:
        return _split_structured(stripped, window_size=window_size, overlap=overlap)
    if strategy.strip().lower() != "fixed":
        raise ValueError(f"Unsupported chunking strategy: {strategy}")
    return _split_fixed(stripped, window_size=window_size, overlap=overlap)


def _split_fixed(stripped: str, *, window_size: int, overlap: int) -> list[TextChunk]:
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


def _split_structured(stripped: str, *, window_size: int, overlap: int) -> list[TextChunk]:
    blocks = _structural_blocks(stripped)
    chunks: list[TextChunk] = []
    current = ""
    current_start = 0

    for block_start, block_text in blocks:
        if _is_heading(block_text) and current.strip():
            _append_chunk(chunks, current, current_start, current_start + len(current))
            current = block_text
            current_start = block_start
            continue

        if len(block_text) > window_size:
            if current.strip():
                _append_chunk(chunks, current, current_start, current_start + len(current))
                current = ""
            for piece in _split_fixed(block_text, window_size=window_size, overlap=overlap):
                _append_chunk(
                    chunks,
                    piece.text,
                    block_start + piece.start,
                    block_start + piece.end,
                )
            continue

        candidate = _join_blocks(current, block_text)
        if current.strip() and len(candidate) > window_size:
            _append_chunk(chunks, current, current_start, current_start + len(current))
            current = block_text
            current_start = block_start
        else:
            if not current:
                current_start = block_start
                current = block_text
            else:
                current = candidate

    if current.strip():
        _append_chunk(chunks, current, current_start, current_start + len(current))

    return [
        TextChunk(text=chunk.text, chunk_index=index, start=chunk.start, end=chunk.end, page=chunk.page)
        for index, chunk in enumerate(chunks)
    ]


def _append_chunk(chunks: list[TextChunk], text: str, start: int, end: int) -> None:
    cleaned = _clean_chunk_start(text.strip())
    if cleaned:
        chunks.append(TextChunk(text=cleaned, chunk_index=len(chunks), start=start, end=end))


def _clean_chunk_start(text: str) -> str:
    return re.sub(r"^[，,。；;：:\s]+", "", text).strip()


def _join_blocks(current: str, block: str) -> str:
    if not current:
        return block
    if _is_heading(block):
        return f"{current.rstrip()}\n\n{block}"
    return f"{current.rstrip()}\n\n{block}"


def _is_heading(text: str) -> bool:
    return bool(re.match(r"^\s{0,3}#{1,6}\s+\S", text))


def _structural_blocks(text: str) -> list[tuple[int, str]]:
    blocks: list[tuple[int, str]] = []
    current: list[str] = []
    current_start = 0
    offset = 0

    def flush() -> None:
        nonlocal current, current_start
        block = "".join(current).strip()
        if block:
            blocks.append((current_start, block))
        current = []

    for line in text.splitlines(keepends=True):
        stripped_line = line.strip()
        if not stripped_line:
            flush()
            offset += len(line)
            continue

        if _is_heading(stripped_line):
            flush()
            current_start = offset
            current = [line]
        else:
            if not current:
                current_start = offset
            current.append(line)
        offset += len(line)

    flush()
    return blocks or [(0, text)]
