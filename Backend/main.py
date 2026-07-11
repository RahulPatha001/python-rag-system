import logging
from fastapi import FastAPI
import inngest
import inngest.fast_api
import uuid
from dotenv import load_dotenv
import os
import datetime
from inngest.experimental import ai

load_dotenv()
app = FastAPI()

inngest_client = inngest.Inngest(
    app_id = "rag_app",
    logger = logging.getLogger("uvicorn"),
    is_production= False,
    serializer=inngest.PydanticSerializer()
)

@inngest_client.create_function(
    fn_id="RAG_Ingest PDF",
    trigger= inngest.TriggerEvent(event="rag/inngest_pdf")
)
async def rag_inngest_pdf(ctx: inngest.Context):
    return {"hello":"world"}

inngest.fast_api.serve(app, inngest_client,[rag_inngest_pdf])