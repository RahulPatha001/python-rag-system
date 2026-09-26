# Sift RAG backend

FastAPI service for the Sift document workspace. It provides a small browser-facing API for health checks, PDF indexing, and grounded questions while retaining the original Inngest functions for event-driven jobs.

## Requirements

- Python 3.12+
- A running Qdrant instance
- An OpenRouter API key in `Backend/.env` as `API_KEY`

```bash
uv sync
cp .env.example .env
```

The repository intentionally ignores `.env`; never expose `API_KEY` to the frontend.

## Run locally

Start Qdrant from the repository root:

```bash
docker compose up qdrant
```

Start FastAPI from this directory:

```bash
uv run uvicorn main:app --reload
```

The frontend development server proxies `/api/*` to `http://localhost:8000` without stripping the prefix, so the browser can use same-origin requests.

For the optional Inngest runner:

```bash
npx inngest-cli@latest dev -u http://127.0.0.1:8000/api/inngest --no-discovery
```

## HTTP API

### `GET /api/health`

Returns readiness for Qdrant and OpenRouter configuration. A degraded service returns `503` with a structured body.

### `POST /api/upload`

Send a PDF as multipart form field `file`. The response contains a server document ID and the number of indexed passages:

```json
{
  "status": "indexed",
  "document_id": "…",
  "filename": "handbook.pdf",
  "ingested": 12
}
```

Uploads are size-limited, checked for a PDF signature, processed in a worker thread, and removed after indexing. The default limit is 25 MB and can be changed with `MAX_UPLOAD_MB`.

### `POST /api/query`

```json
{
  "question": "What is the retention period?",
  "top_k": 5
}
```

The response contains a grounded answer and source passages:

```json
{
  "answer": "…",
  "num_contexts": 1,
  "sources": [
    {
      "id": "source_1",
      "title": "policy.pdf",
      "content": "…",
      "location": "Retrieved passage",
      "score": 0.91
    }
  ]
}
```

If the configured language model is temporarily unavailable, the API returns a clearly labeled extractive fallback with the retrieved passages instead of inventing an answer.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_KEY` | — | OpenRouter credential for embeddings and generation |
| `LLM_MODEL` | `nvidia/nemotron-3-super-120b-a12b:free` | Generation model; set this to another OpenRouter model as needed |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL |
| `QDRANT_COLLECTION` | `docs` | Qdrant collection name |
| `MAX_UPLOAD_MB` | `25` | Maximum PDF upload size |
| `UPLOAD_DIR` | `Backend/uploads` | Temporary upload directory |
| `CORS_ORIGINS` | local Vite origins | Comma-separated production origins |
| `INNGEST_IS_PRODUCTION` | `false` | Enables Inngest production signature behavior when configured with keys |

## Tests

```bash
uv run pytest -q
```

The API currently has no user authentication. Put it behind an authenticated reverse proxy, configure `CORS_ORIGINS`, use HTTPS, and configure Inngest signing/event keys before exposing it publicly. The vector collection is global; add tenant/user filters before hosting multiple users.


to run inngest:
1. node js should be installed 
2. npx inngest-cli@latest dev -u <link to the api>
    in local this will be npx inngest-cli@latest dev -u http://127.0.0.1:8000/api/inngest --no-discovery