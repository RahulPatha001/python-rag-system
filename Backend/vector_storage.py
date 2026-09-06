from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct


class QdrantStorage:
    def __init__(self, collection_name="docs", url="http://localhost:6333", dim=3072):
        self.collection_name = collection_name
        self.client = QdrantClient(url=url, timeout=30)
        self.dim = dim
        if not self.client.collection_exists(collection_name):
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            )

    def upsert(self, ids, vectors, payloads):
        points = [
            PointStruct(id=ids[i], vector=vectors[i], payload=payloads[i])
            for i in range(len(ids))
        ]
        self.client.upsert(collection_name=self.collection_name, points=points)

    def search(self, vector, limit=5):
        results = self.client.search(   
            collection_name=self.collection_name,
            query_vector=vector,
            with_payload=True,
            limit=limit,
        )

        contexts = []
        sources = set()
        for result in results:
            payload = getattr(result, "payload", {})
            text = payload.get("text", "")
            source = payload.get("source", "")
            if text:
                contexts.append(text)
            if source:
                sources.add(source)
        return {"contexts": contexts, "sources": list(sources)}
