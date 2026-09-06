import logging
from fastapi import FastAPI
import inngest
import inngest.fast_api
import uuid
from dotenv import load_dotenv
import os
import datetime
from inngest.experimental import ai
from data_loader import load_and_chunk_pdf, embed_texts
from vector_storage import QdrantStorage
from models import RAGQueryResult, RAGUpsertResult, RAGSearchResult, RAGChunkSrc

load_dotenv()
app = FastAPI()

inngest_client = inngest.Inngest(
    app_id="rag_app",
    logger=logging.getLogger("uvicorn"),
    is_production=False,
    serializer=inngest.PydanticSerializer(),
)

@inngest_client.create_function(
    fn_id="RAG_Ingest PDF", trigger=inngest.TriggerEvent(event="rag/inngest_pdf")
)
async def rag_inngest_pdf(ctx: inngest.Context) -> RAGChunkSrc:
    def _load(ctx: inngest.Context):
        pdf_path = ctx.event.data["pdf_path"]
        source_id = ctx.event.data.get("source_id", pdf_path)
        chunks = load_and_chunk_pdf(pdf_path)
        return RAGChunkSrc(chunks=chunks, source_id=source_id)

    def _upsert(chunks_and_src: RAGChunkSrc) -> RAGUpsertResult:
        chunks = chunks_and_src.chunks
        source_id = chunks_and_src.source_id
        vectors = embed_texts(chunks)
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_id}_{i}")) for i in range(len(chunks))]
        payloads = [{"text": chunk, "source": source_id} for chunk in chunks]
        return RAGUpsertResult(ingested=len(chunks))

    chunks_and_src = await ctx.step.run("chunk and src", lambda: _load(ctx), output_type=RAGChunkSrc)
    ingested = await ctx.step.run("embed and upsert", lambda: _upsert(chunks_and_src), output_type=RAGUpsertResult)
    return ingested.model_dump()

@inngest_client.create_function(
    fn_id="RAG: Query PDF", trigger=inngest.TriggerEvent(event="rag/query_pdf")
)
async def rag_query_pdf(ctx: inngest.Context):
    def _search(question: str, top_k: int = 5) -> RAGSearchResult:
        query_vector = embed_texts([question])[0]
        storage = QdrantStorage()
        found = storage.search(query_vector, limit=top_k)
        return RAGSearchResult(contexts=found["contexts"], sources=found["sources"])

    question = ctx.event.data["question"]
    top_k = int(ctx.event.data.get("top_k", 5))
    search_result = await ctx.step.run("embed and search", lambda: _search(question, top_k), output_type=RAGSearchResult)
    context_block = "\n\n".join(f"- {c}" for c in search_result.contexts)
    user_content = (
        "Use the following context to answer the question.\n\n"
        f"Context:\n{context_block}\n\n"
        f"Question: {question}\n"
        "Answer concisely using the context above."
    )


inngest.fast_api.serve(app, inngest_client, [rag_inngest_pdf])
