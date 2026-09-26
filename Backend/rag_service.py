import logging
import uuid
from types import SimpleNamespace

from data_loader import LLM_MODEL, client, embed_texts, load_and_chunk_pdf
from models import RAGSearchResult
from vector_storage import QdrantStorage

logger = logging.getLogger("uvicorn")


def ingest_pdf(file_path: str, document_id: str, title: str) -> int:
    chunks = load_and_chunk_pdf(file_path)
    if not chunks:
        raise ValueError("No readable text was found in the PDF.")

    vectors = embed_texts(chunks)
    if len(vectors) != len(chunks):
        raise RuntimeError("The embedding service returned an unexpected number of vectors.")

    point_ids = [
        str(uuid.uuid5(uuid.NAMESPACE_URL, f"{document_id}_{index}"))
        for index in range(len(chunks))
    ]
    payloads = [
        {
            "text": chunk,
            "source": document_id,
            "title": title,
            "filename": title,
        }
        for chunk in chunks
    ]

    storage = QdrantStorage()
    storage.upsert(ids=point_ids, vectors=vectors, payloads=payloads)
    return len(chunks)


def search_pdf(question: str, top_k: int = 5) -> RAGSearchResult:
    query_vector = embed_texts([question])[0]
    result = QdrantStorage().search(query_vector, limit=top_k)
    return RAGSearchResult.model_validate(result)


def generate_answer(question: str, search_result: RAGSearchResult) -> str:
    if not search_result.contexts:
        return "I couldn’t find enough information in the indexed documents to answer that question."

    context_blocks = []
    for index, match in enumerate(search_result.matches, start=1):
        title = match.title or match.source
        context_blocks.append(f"[{index}] Source: {title}\n{match.text}")
    if not context_blocks:
        for index, context in enumerate(search_result.contexts, start=1):
            source = search_result.sources[index - 1] if index <= len(search_result.sources) else "Retrieved passage"
            context_blocks.append(f"[{index}] Source: {source}\n{context}")
    context_block = "\n\n".join(context_blocks)

    if client is None:
        raise RuntimeError("API_KEY is not configured on the backend.")

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            max_tokens=1_024,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You answer questions using only the provided context. "
                        "If the context does not contain the answer, say so clearly."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Context:\n{context_block}\n\n"
                        f"Question: {question}\n"
                        "Answer concisely using only the context above."
                    ),
                },
            ],
        )
        if not response.choices:
            raise RuntimeError("The language model returned no choices.")
        content = response.choices[0].message.content
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("The language model returned an empty answer.")
        return content.strip()
    except Exception:
        logger.warning("The configured language model is unavailable; using extractive fallback.", exc_info=True)
        excerpts = []
        fallback_matches = search_result.matches or [
            SimpleNamespace(
                title=search_result.sources[index] if index < len(search_result.sources) else "Retrieved passage",
                text=text,
            )
            for index, text in enumerate(search_result.contexts[:3])
        ]
        for index, match in enumerate(fallback_matches[:3], start=1):
            title = match.title or "Retrieved passage"
            excerpt = match.text.strip().replace("\n", " ")
            excerpts.append(f"[{index}] {title}: {excerpt[:700]}")
        return (
            "The language model is temporarily unavailable, so I’m showing the most relevant "
            "passages instead. Please verify the details in the cited sources.\n\n"
            + "\n\n".join(excerpts)
        )
