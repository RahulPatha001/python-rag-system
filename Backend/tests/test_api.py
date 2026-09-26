import pytest
from fastapi.testclient import TestClient

import main
from models import RAGSearchResult, RAGSourceMatch


@pytest.fixture
def client():
    return TestClient(main.app)


class FakeQdrantClient:
    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.closed = False

    def get_collections(self):
        if self.fail:
            raise ConnectionError("Qdrant is unavailable")
        return object()

    def close(self):
        self.closed = True


def test_health_reports_ready(monkeypatch, client):
    qdrant = FakeQdrantClient()
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setattr(main, "QdrantClient", lambda **_: qdrant)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["checks"]["qdrant"] == "ready"
    assert qdrant.closed is True


def test_legacy_health_route_is_supported(monkeypatch, client):
    qdrant = FakeQdrantClient()
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setattr(main, "QdrantClient", lambda **_: qdrant)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["service"] == "sift-rag-api"


def test_health_reports_degraded_when_qdrant_is_down(monkeypatch, client):
    monkeypatch.setenv("API_KEY", "test-key")
    monkeypatch.setattr(main, "QdrantClient", lambda **_: FakeQdrantClient(fail=True))

    response = client.get("/api/health")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    assert response.json()["checks"]["qdrant"] == "unavailable"


def test_upload_indexes_pdf_and_removes_temporary_file(monkeypatch, client, tmp_path):
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(main, "ingest_pdf", lambda path, document_id, title: 3)

    response = client.post(
        "/api/upload",
        files={"file": ("guide.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
    )

    assert response.status_code == 200
    assert response.json() == {
        "status": "indexed",
        "document_id": response.json()["document_id"],
        "filename": "guide.pdf",
        "ingested": 3,
    }
    assert list(tmp_path.iterdir()) == []


def test_upload_rejects_non_pdf(client):
    response = client.post(
        "/api/upload",
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )

    assert response.status_code == 415
    assert response.json()["detail"] == "Only PDF documents are supported."


def test_query_returns_grounded_sources(monkeypatch, client):
    search_result = RAGSearchResult(
        contexts=["The retention period is 30 days."],
        sources=["document-1"],
        matches=[RAGSourceMatch(
            text="The retention period is 30 days.",
            source="document-1",
            title="policy.pdf",
            score=0.91,
        )],
    )
    monkeypatch.setattr(main, "search_pdf", lambda question, top_k: search_result)
    monkeypatch.setattr(main, "generate_answer", lambda question, result: "It is 30 days.")

    response = client.post("/api/query", json={"question": "What is the retention period?"})

    assert response.status_code == 200
    assert response.json() == {
        "answer": "It is 30 days.",
        "num_contexts": 1,
        "sources": [{
            "id": "source_1",
            "title": "policy.pdf",
            "content": "The retention period is 30 days.",
            "location": "Retrieved passage",
            "score": 0.91,
        }],
    }


def test_query_validates_input(client):
    response = client.post("/api/query", json={"question": "", "top_k": 5})

    assert response.status_code == 422
