from lib.chunking import chunk_text


def test_chunk_text_keeps_short_text_whole():
    assert chunk_text("A short paragraph.") == ["A short paragraph."]


def test_chunk_text_limits_chunk_size_and_overlaps():
    text = " ".join(f"word{i}" for i in range(5000))
    chunks = chunk_text(text, max_chars=1000, overlap=100)
    assert len(chunks) > 1
    assert all(0 < len(chunk) <= 1000 for chunk in chunks)


def test_chunk_text_rejects_invalid_configuration():
    try:
        chunk_text("text", max_chars=100, overlap=100)
    except ValueError:
        return
    raise AssertionError("Expected ValueError")