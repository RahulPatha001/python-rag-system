import os

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams


class QdrantStorage:
    def __init__(
        self,
        collection_name: str | None = None,
        url: str | None = None,
        dim: int = 2_048,
    ):
        self.collection_name = collection_name or os.getenv("QDRANT_COLLECTION", "docs")
        self.client = QdrantClient(
            url=url or os.getenv("QDRANT_URL", "http://localhost:6333"),
            timeout=30,
        )
        self.dim = dim

        if self.client.collection_exists(self.collection_name):
            info = self.client.get_collection(self.collection_name)
            existing_dim = info.config.params.vectors.size
            if existing_dim != dim:
                self.client.delete_collection(self.collection_name)
                self._create_collection()
        else:
            self._create_collection()

    def _create_collection(self) -> None:
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(size=self.dim, distance=Distance.COSINE),
        )

    def upsert(self, ids: list[str], vectors: list[list[float]], payloads: list[dict]) -> None:
        if not (len(ids) == len(vectors) == len(payloads)):
            raise ValueError("Point IDs, vectors, and payloads must have the same length.")

        points = [
            PointStruct(id=point_id, vector=vector, payload=payload)
            for point_id, vector, payload in zip(ids, vectors, payloads, strict=True)
        ]
        self.client.upsert(collection_name=self.collection_name, points=points)

    def search(self, vector: list[float], limit: int = 5) -> dict:
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=vector,
            with_payload=True,
            limit=limit,
        )

        contexts = []
        sources = []
        matches = []
        for result in results.points:
            payload = result.payload or {}
            text = str(payload.get("text", "")).strip()
            source = str(payload.get("source", "")).strip()
            if not text:
                continue

            contexts.append(text)
            if source and source not in sources:
                sources.append(source)
            matches.append({
                "text": text,
                "source": source,
                "title": str(payload.get("title") or payload.get("filename") or source),
                "score": float(result.score) if result.score is not None else None,
            })

        return {
            "contexts": contexts,
            "sources": sources,
            "matches": matches,
        }
