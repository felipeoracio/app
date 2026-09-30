"""Phase 16 — pluggable document pipeline.

Proves the default text-layer processors are registered, that images/scanned
and unknown formats are cleanly rejected (no OCR implemented), and that a new
format can be plugged in via register_processor() without touching the
dispatcher.
"""

import pytest

from lib import document_processing as dp
from lib.document_processing import (
    DocumentProcessingError,
    DocumentProcessor,
    extract_document,
    register_processor,
    supported_extensions,
)


def test_default_processors_registered():
    exts = supported_extensions()
    for ext in (".txt", ".md", ".markdown", ".pdf", ".docx"):
        assert ext in exts
    # OCR / image formats are intentionally NOT registered yet.
    assert ".png" not in exts
    assert ".jpg" not in exts


def test_unsupported_extension_message():
    with pytest.raises(DocumentProcessingError, match="Supported formats"):
        extract_document("archive.zip", b"PK")


def test_images_not_supported_without_ocr():
    with pytest.raises(DocumentProcessingError, match="Supported formats"):
        extract_document("scan.png", b"\x89PNG\r\n\x1a\n")


def test_new_processor_plugs_in():
    class UnoTestProcessor(DocumentProcessor):
        name = "unotest"
        mime_by_extension = {".unotest": "text/x-unotest"}

        def extract(self, data: bytes) -> str:
            return data.decode("utf-8")

    register_processor(UnoTestProcessor())
    try:
        result = extract_document("sample.unotest", b"hello plugged in world")
        assert "plugged in" in result.text
        assert result.file_type == "text/x-unotest"
        assert result.word_count == 4
    finally:
        dp._PROCESSOR_BY_EXTENSION.pop(".unotest", None)
        dp.MIME_BY_EXTENSION.pop(".unotest", None)
        dp._PROCESSORS[:] = [p for p in dp._PROCESSORS if p.name != "unotest"]
