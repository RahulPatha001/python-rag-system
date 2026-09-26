import os

from dotenv import load_dotenv
from llama_index.core.node_parser import SentenceSplitter
from llama_index.readers.file import PDFReader
from openai import OpenAI

load_dotenv()

API_KEY = os.getenv("API_KEY")
EMBED_MODEL = "nvidia/nemotron-3-embed-1b:free"
LLM_MODEL = os.getenv("LLM_MODEL", "nvidia/nemotron-3-super-120b-a12b:free")
EMBED_DIM = 2_048
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

client = (
    OpenAI(
        api_key=API_KEY,
        base_url=OPENROUTER_BASE_URL,
        timeout=60.0,
        max_retries=2,
    )
    if API_KEY
    else None
)

splitter = SentenceSplitter(chunk_size=1_000, chunk_overlap=200)


def load_and_chunk_pdf(file_path: str) -> list[str]:
    pdf_reader = PDFReader()
    documents = pdf_reader.load_data(file=file_path)
    texts = [document.text for document in documents if getattr(document, "text", None)]
    return splitter.split_text("\n\n".join(texts))


def embed_texts(texts: list[str]) -> list[list[float]]:
    if client is None:
        raise RuntimeError("API_KEY is not configured on the backend.")

    response = client.embeddings.create(
        model=EMBED_MODEL,
        input=texts,
        encoding_format="float",
    )
    return [item.embedding for item in response.data]
