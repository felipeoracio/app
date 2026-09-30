from io import BytesIO

import pytest
from docx import Document
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from lib.document_processing import DocumentProcessingError, extract_document


def text_pdf_bytes(text: str) -> bytes:
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    })
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
    })
    stream = DecodedStreamObject()
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream.set_data(f"BT /F1 12 Tf 72 720 Td ({safe}) Tj ET".encode("latin-1"))
    page[NameObject("/Contents")] = writer._add_object(stream)
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def docx_bytes(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    output = BytesIO()
    document.save(output)
    return output.getvalue()


@pytest.mark.parametrize(
    ("filename", "data", "phrase"),
    [
        ("notes.txt", b"Private text notes", "Private text notes"),
        ("outline.md", b"# Chapter\nPrivate markdown outline", "Private markdown outline"),
        ("memoir.pdf", text_pdf_bytes("Private PDF memoir"), "Private PDF memoir"),
        ("draft.docx", docx_bytes("Private DOCX chapter"), "Private DOCX chapter"),
    ],
)
def test_extracts_supported_text_layers(filename, data, phrase):
    result = extract_document(filename, data)
    assert phrase in result.text
    assert result.word_count > 0


def test_rejects_scanned_or_empty_pdf_text_layer():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    output = BytesIO()
    writer.write(output)
    with pytest.raises(DocumentProcessingError, match="No extractable text"):
        extract_document("scan.pdf", output.getvalue())


def test_rejects_unsupported_extensions():
    with pytest.raises(DocumentProcessingError, match="Supported formats"):
        extract_document("archive.zip", b"PK")