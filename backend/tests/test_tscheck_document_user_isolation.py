"""Document data is isolated by user (acceptance matrix criterion 5).

User B must not be able to read status or delete a document created by
User A -- RLS plus the API's own user-scoped lookups must reject it.
"""

import io


def _create_document_as_a(client_a, suffix: str) -> str:
    response = client_a.post(
        "/documents/upload",
        data={"document_title": f"tscheck-doc-isolation-{suffix}", "document_type": "notes"},
        files={"file": (f"tscheck-isolation-{suffix}.txt", io.BytesIO(b"User A private isolation content"), "text/plain")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_user_b_cannot_read_user_a_document_status(client_a, client_b):
    document_id = _create_document_as_a(client_a, "status")
    response = client_b.get(f"/documents/status/{document_id}")
    assert response.status_code == 404, response.text

    # User A can still read it -- proves the 404 above is isolation, not breakage.
    own = client_a.get(f"/documents/status/{document_id}")
    assert own.status_code == 200, own.text


def test_user_b_cannot_delete_user_a_document(client_a, client_b):
    document_id = _create_document_as_a(client_a, "delete")
    response = client_b.delete(f"/documents/{document_id}")
    assert response.status_code == 404, response.text

    still_there = client_a.get(f"/documents/status/{document_id}")
    assert still_there.status_code == 200, still_there.text
    assert still_there.json()["processing_status"] == "ready"
