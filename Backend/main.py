import asyncio
import logging
import os
import uuid
from pathlib import Path

import inngest
import inngest.fast_api
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from inngest.experimental import ai
from qdrant_client import QdrantClient

from data_loader import LLM_MODEL, embed_texts, load_and_chunk_pdf
from models import (
    HealthResponse,
    QueryRequest,
    QueryResponse,
    RAGChunkSrc,
    RAGQueryResult,
    RAGSearchResult,
    RAGUpsertResult,
    SourceCitation,
    UploadResponse,
)
from rag_service import generate_answer, ingest_pdf, search_pdf
from vector_storage import QdrantStorage

load_dotenv()

logger = logging.getLogger("uvicorn")
app = FastAPI(
    title="Sift RAG API",
    description="Document ingestion and grounded question-answering API.",
    version="1.0.0",
)

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type"],
)

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path(__file__).parent / "uploads")).resolve()
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

inngest_client = inngest.Inngest(
    app_id="rag_app",
    logger=logger,
    is_production=os.getenv("INNGEST_IS_PRODUCTION", "false").lower() == "true",
    serializer=inngest.PydanticSerializer(),
)


def _safe_pdf_name(filename: str | None) -> str:
    raw_name = Path((filename or "").replace("\\", "/")).name
    cleaned = "".join(character for character in raw_name if character.isprintable()).strip()
    if not cleaned:
        return "document.pdf"
    if not cleaned.lower().endswith(".pdf"):
        cleaned = f"{cleaned}.pdf"
    return cleaned[:180]


async def _save_upload(file: UploadFile, destination: Path) -> int:
    size = 0
    with destination.open("wb") as output:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"PDF exceeds the {MAX_UPLOAD_BYTES // 1024 // 1024} MB upload limit.",
                )
            output.write(chunk)
    return size


def _validate_pdf(file: UploadFile) -> str:
    filename = _safe_pdf_name(file.filename)
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=415, detail="Only PDF documents are supported.")
    if file.content_type and file.content_type not in {
        "application/pdf",
        "application/octet-stream",
        "application/x-pdf",
    }:
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF.")
    return filename


@app.get("/api/health", response_model=HealthResponse)
async def health() -> JSONResponse:
    checks = {
        "openrouter": "configured" if os.getenv("API_KEY") else "missing",
        "qdrant": "unavailable",
    }
    qdrant_ready = False
    qdrant_client = None

    try:
        qdrant_client = QdrantClient(
            url=os.getenv("QDRANT_URL", "http://localhost:6333"),
            timeout=3,
        )
        qdrant_client.get_collections()
        checks["qdrant"] = "ready"
        qdrant_ready = True
    except Exception:
        logger.warning("Qdrant health check failed.", exc_info=True)
    finally:
        if qdrant_client is not None:
            qdrant_client.close()

    is_ready = qdrant_ready and checks["openrouter"] == "configured"
    payload = HealthResponse(
        status="ok" if is_ready else "degraded",
        service="sift-rag-api",
        version=app.version,
        checks=checks,
    )
    return JSONResponse(
        status_code=200 if is_ready else 503,
        content=payload.model_dump(),
    )


@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)) -> UploadResponse:
    filename = _validate_pdf(file)
    document_id = str(uuid.uuid4())
    destination = UPLOAD_DIR / f"{document_id}-{filename}"

    try:
        size = await _save_upload(file, destination)
        if size == 0:
            raise HTTPException(status_code=400, detail="The uploaded PDF is empty.")
        with destination.open("rb") as pdf:
            if pdf.read(5) != b"%PDF-":
                raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF.")

        ingested = await asyncio.to_thread(ingest_pdf, str(destination), document_id, filename)
        return UploadResponse(
            status="indexed",
            document_id=document_id,
            filename=filename,
            ingested=ingested,
        )
    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        logger.exception("PDF processing failed.")
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Unexpected PDF processing failure.")
        raise HTTPException(
            status_code=502,
            detail="The PDF could not be indexed. Please try again later.",
        ) from error
    finally:
        destination.unlink(missing_ok=True)
        await file.close()


@app.post("/api/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest) -> QueryResponse:
    try:
        search_result = await asyncio.to_thread(search_pdf, request.question, request.top_k)
        answer = await asyncio.to_thread(generate_answer, request.question, search_result)
    except RuntimeError as error:
        logger.exception("RAG query failed.")
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        logger.exception("Unexpected RAG query failure.")
        raise HTTPException(
            status_code=502,
            detail="The answer could not be generated. Please try again later.",
        ) from error

    sources = [
        SourceCitation(
            id=f"source_{index}",
            title=match.title or match.source or "Retrieved passage",
            content=match.text,
            location="Retrieved passage",
            score=match.score,
        )
        for index, match in enumerate(search_result.matches, start=1)
    ]
    return QueryResponse(
        answer=answer,
        num_contexts=len(search_result.contexts),
        sources=sources,
    )


# Keep the pre-/api routes available for older frontend bundles and local
# reverse-proxy configurations. New clients should use /api/*.
@app.get("/health", response_model=HealthResponse, include_in_schema=False)
async def legacy_health() -> JSONResponse:
    return await health()


@app.post("/upload", response_model=UploadResponse, include_in_schema=False)
async def legacy_upload(file: UploadFile = File(...)) -> UploadResponse:
    return await upload_document(file)


@app.post("/query", response_model=QueryResponse, include_in_schema=False)
async def legacy_query(request: QueryRequest) -> QueryResponse:
    return await query_documents(request)


@inngest_client.create_function(
    fn_id="RAG_Ingest PDF", trigger=inngest.TriggerEvent(event="rag/inngest_pdf")
)
async def rag_inngest_pdf(ctx: inngest.Context) -> dict:
    def _load(ctx: inngest.Context) -> RAGChunkSrc:
        pdf_path = ctx.event.data["pdf_path"]
        source_id = ctx.event.data.get("source_id", pdf_path)
        chunks = load_and_chunk_pdf(pdf_path)
        return RAGChunkSrc(chunks=chunks, source_id=source_id)

    def _upsert(chunks_and_src: RAGChunkSrc) -> RAGUpsertResult:
        chunks = chunks_and_src.chunks
        source_id = chunks_and_src.source_id
        vectors = embed_texts(chunks)
        ids = [str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_id}_{index}")) for index in range(len(chunks))]
        payloads = [
            {"text": chunk, "source": source_id, "title": source_id}
            for chunk in chunks
        ]
        storage = QdrantStorage()
        storage.upsert(ids=ids, vectors=vectors, payloads=payloads)
        return RAGUpsertResult(ingested=len(chunks))

    chunks_and_src = await ctx.step.run(
        "chunk and src",
        lambda: _load(ctx),
        output_type=RAGChunkSrc,
    )
    ingested = await ctx.step.run(
        "embed and upsert",
        lambda: _upsert(chunks_and_src),
        output_type=RAGUpsertResult,
    )
    return ingested.model_dump()


@inngest_client.create_function(
    fn_id="RAG: Query PDF", trigger=inngest.TriggerEvent(event="rag/query_pdf")
)
async def rag_query_pdf(ctx: inngest.Context) -> dict:
    def _search(question: str, top_k: int = 5) -> RAGSearchResult:
        query_vector = embed_texts([question])[0]
        found = QdrantStorage().search(query_vector, limit=top_k)
        return RAGSearchResult.model_validate(found)

    question = ctx.event.data["question"]
    top_k = int(ctx.event.data.get("top_k", 5))
    search_result = await ctx.step.run(
        "embed and search",
        lambda: _search(question, top_k),
        output_type=RAGSearchResult,
    )
    context_block = "\n\n".join(
        f"[{index}] {match.title or match.source}\n{match.text}"
        for index, match in enumerate(search_result.matches, start=1)
    )
    user_content = (
        "Use the following context to answer the question.\n\n"
        f"Context:\n{context_block}\n\n"
        f"Question: {question}\n"
        "Answer concisely using the context above."
    )
    adapter = ai.openai.Adapter(
        auth_key=os.environ.get("API_KEY"),
        base_url="https://openrouter.ai/api/v1",
        model=LLM_MODEL,
    )
    result = await ctx.step.ai.infer(
        "llm answer",
        adapter=adapter,
        body={
            "max_tokens": 1_024,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": "You answer questions using only the provided context.",
                },
                {"role": "user", "content": user_content},
            ],
        },
    )
    answer = result["choices"][0]["message"]["content"].strip()
    return RAGQueryResult(
        answer=answer,
        sources=search_result.sources,
        num_contexts=len(search_result.contexts),
    ).model_dump()


inngest.fast_api.serve(app, inngest_client, [rag_inngest_pdf, rag_query_pdf])
