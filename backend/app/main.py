from fastapi import FastAPI

from app.api.routes import router as api_router

app = FastAPI(title="MedStream API")

app.include_router(api_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "MedStream API is running"}
