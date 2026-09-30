"""Deterministic text chunking for documents and explicitly saved writing."""


def chunk_text(text: str, max_chars: int = 12_000, overlap: int = 400) -> list[str]:
    value = (text or "").strip()
    if not value:
        return []
    if max_chars < 1 or overlap < 0 or overlap >= max_chars:
        raise ValueError("Invalid chunk configuration")

    chunks: list[str] = []
    start = 0
    while start < len(value):
        hard_end = min(len(value), start + max_chars)
        end = hard_end
        if hard_end < len(value):
            boundary = max(value.rfind("\n", start + max_chars // 2, hard_end), value.rfind(" ", start + max_chars // 2, hard_end))
            if boundary > start:
                end = boundary
        chunk = value[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(value):
            break
        start = max(start + 1, end - overlap)
    return chunks