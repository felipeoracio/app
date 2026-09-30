"""Deletion is complete (acceptance matrix criterion 6).

Deleting a document must remove the metadata row (status becomes 404) and it
must disappear from the owner's document list; the API returns 204 for the
delete call itself.
"""

import io


def test_delete_removes_document_metadata_and_listing(client_a):
    upload = client_a.post(
        "/documents/upload",
        data={"document_title": "tscheck-doc-deletion", "document_type": "notes"},
        files={"file": ("tscheck-deletion.txt", io.BytesIO(b"Content to be deleted by the test"), "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    document_id = upload.json()["id"]

    delete_response = client_a.delete(f"/documents/{document_id}")
    assert delete_response.status_code == 204, delete_response.text

    status_response = client_a.get(f"/documents/status/{document_id}")
    assert status_response.status_code == 404, status_response.text

    listing = client_a.get("/documents")
    assert listing.status_code == 200, listing.text
    assert document_id not in [doc["id"] for doc in listing.json()]


def test_delete_of_unknown_document_returns_404(client_a):
    response = client_a.delete("/documents/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404, response.text
