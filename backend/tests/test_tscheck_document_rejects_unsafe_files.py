"""Unsafe or unsupported files fail gracefully (acceptance matrix criterion 4).

Unsupported extensions and scanned/empty-text PDFs must return 422; files
over 5 MB must return 413.
"""

import io

from tests._file_fixtures import scanned_pdf_bytes

MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def test_unsupported_extension_returns_422(client_a):
    response = client_a.post(
        "/documents/upload",
        data={"document_title": "tscheck-doc-unsupported-ext", "document_type": "notes"},
        files={"file": ("tscheck-archive.zip", io.BytesIO(b"PK\x03\x04 not a real document"), "application/zip")},
    )
    assert response.status_code == 422, response.text


def test_scanned_pdf_without_text_layer_returns_422(client_a):
    response = client_a.post(
        "/documents/upload",
        data={"document_title": "tscheck-doc-scanned-pdf", "document_type": "notes"},
        files={"file": ("tscheck-scan.pdf", io.BytesIO(scanned_pdf_bytes()), "application/pdf")},
    )
    assert response.status_code == 422, response.text


def test_oversized_file_returns_413(client_a):
    oversized = b"a" * (MAX_UPLOAD_BYTES + 1024)
    response = client_a.post(
        "/documents/upload",
        data={"document_title": "tscheck-doc-oversized", "document_type": "notes"},
        files={"file": ("tscheck-huge.txt", io.BytesIO(oversized), "text/plain")},
    )
    assert response.status_code == 413, response.text
