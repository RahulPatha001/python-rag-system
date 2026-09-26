# Sift frontend

A responsive React workspace for asking questions against uploaded documents. The interface keeps the full workflow in one place: add files, hold a conversation, inspect retrieved evidence, and recover from network or server failures without losing local work.

## Features

- Drag-and-drop PDF upload with validation, indexing feedback, and server error reporting
- Markdown-aware answers with copy, retry, and cancellation controls
- Source passage panel with relevance scores and expandable excerpts
- Persistent conversations and uploaded-document metadata in `localStorage`
- Responsive desktop, tablet, and mobile navigation
- API timeout handling, offline detection, connection retry, and an app-level error boundary
- Vite development proxy so the browser can use same-origin `/api` requests

## Local development

```bash
npm install
cp .env.example .env
npm run dev
```

The development proxy sends `/api/*` requests to `http://localhost:8000` by default, preserving the backend’s `/api` prefix. Change `VITE_BACKEND_PROXY_TARGET` if the FastAPI server uses another port.

For a production build:

```bash
npm run build
npm run preview
```

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Public API origin or base path | `/api` |
| `VITE_UPLOAD_ENDPOINT` | PDF upload path | `/upload` |
| `VITE_QUERY_ENDPOINT` | Question/answer path | `/query` |
| `VITE_HEALTH_ENDPOINT` | Connection-check path | `/health` |
| `VITE_BACKEND_PROXY_TARGET` | Vite-only development proxy target | `http://localhost:8000` |

All variables prefixed with `VITE_` are embedded into the browser bundle. Never put secrets in them. When `VITE_API_BASE_URL` points to a different origin in production, configure CORS and HTTPS on that API.

The backend upload endpoint accepts one PDF in the multipart `file` field and returns an indexed document ID. Query responses contain `answer` and source objects with `id`, `title`, `content`, and an optional relevance `score`.

## Quality checks

```bash
npm run lint
npm run build
```
