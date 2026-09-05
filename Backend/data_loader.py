import os
from openai import OpenAI
from llama_index.readers.file import PDFReader
from llama_index.core.node_parser import SentenceSplitter
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("API_KEY"))
EMBED_MODEL = "text-embedding-3-large"
EMBED_DIM = 3072

splitter = SentenceSplitter(chunk_size=1000, chunk_overlap=200)


def load_and_chunk_pdf(file_path):
    pdf_reader = PDFReader()
    documents = pdf_reader.load_data(file=file_path)
    texts = [d.text for d in documents if getattr(d, "text", None)]
    chunks = []
    for text in texts:
        chunks.extend(splitter.split_text(text))
    return chunks


def embed_texts(texts: list[str]) -> list[list[float]]:
    response = client.embeddings.create(model=EMBED_MODEL, input=texts)
    embeddings = [item.embedding for item in response.data]
    return embeddings
