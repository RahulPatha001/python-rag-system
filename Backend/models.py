import pydantic


class RAGChunkSrc(pydantic.BaseModel):
    chunks: list[str]
    source_id: str | None = None


class RAGUpsertResult(pydantic.BaseModel):
    ingested: int


class RAGSourceMatch(pydantic.BaseModel):
    text: str
    source: str
    title: str | None = None
    score: float | None = None


class RAGSearchResult(pydantic.BaseModel):
    contexts: list[str]
    sources: list[str]
    matches: list[RAGSourceMatch] = pydantic.Field(default_factory=list)


class RAGQueryResult(pydantic.BaseModel):
    answer: str
    num_contexts: int
    sources: list[str]


class SourceCitation(pydantic.BaseModel):
    id: str
    title: str
    content: str
    location: str | None = None
    score: float | None = None


class QueryRequest(pydantic.BaseModel):
    question: str = pydantic.Field(min_length=1, max_length=4_000)
    top_k: int = pydantic.Field(default=5, ge=1, le=10)


class QueryResponse(pydantic.BaseModel):
    answer: str
    num_contexts: int
    sources: list[SourceCitation]


class UploadResponse(pydantic.BaseModel):
    status: str
    document_id: str
    filename: str
    ingested: int


class HealthResponse(pydantic.BaseModel):
    status: str
    service: str
    version: str
    checks: dict[str, str]
