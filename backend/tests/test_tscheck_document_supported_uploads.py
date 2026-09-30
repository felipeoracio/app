"""Supported files process successfully (acceptance matrix criterion 3).

Authenticated Pro user uploads TXT, Markdown, text-layer PDF, and DOCX files;
each must return HTTP 201 with a ready status and a positive word count, and
then show up in the private document list.
"""

import io

import pytest

from tests._file_fixtures import docx_bytes, text_pdf_bytes


@pytest.mark.parametrize(
    ("suffix", "filename", "content_type", "build_bytes", "title_word"),
    [
        ("txt", "tscheck-doc-{suffix}.txt", "text/plain", lambda: b"Private tscheck text notes about a memoir project", "txt"),
        ("md", "tscheck-doc-{suffix}.md", "text/markdown", lambda: b"# Chapter\nPrivate tscheck markdown outline content", "md"),
        ("pdf", "tscheck-doc-{suffix}.pdf", "application/pdf", lambda: text_pdf_bytes("Private tscheck PDF memoir chapter text"), "pdf"),
        ("docx", "tscheck-doc-{suffix}.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", lambda: docx_bytes("Private tscheck DOCX chapter content"), "docx"),
    ],
)
def test_supported_file_type_uploads_and_processes(client_a, suffix, filename, content_type, build_bytes, title_word):
    data = build_bytes()
    resolved_name = filename.format(suffix=suffix)
    title = f"tscheck-doc-title-{suffix}"

    response = client_a.post(
        "/documents/upload",
        data={"document_title": title, "document_type": "notes"},
        files={"file": (resolved_name, io.BytesIO(data), content_type)},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["processing_status"] == "ready", body
    assert body["word_count"] > 0, body
    document_id = body["id"]

    listed = client_a.get("/documents")
    assert listed.status_code == 200, listed.text
    ids = [doc["id"] for doc in listed.json()]
    assert document_id in ids

    status_resp = client_a.get(f"/documents/status/{document_id}")
    assert status_resp.status_code == 200, status_resp.text
    assert status_resp.json()["processing_status"] == "ready"
