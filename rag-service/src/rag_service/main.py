from fastapi import FastAPI

app = FastAPI(title="RAG Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
