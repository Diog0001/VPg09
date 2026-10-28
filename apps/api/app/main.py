from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db import Base, SessionLocal, engine
from app.models import *  # noqa: F401,F403
from app.routers import auth, edges, tasks, workspaces
from app.seed import seed_demo


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.seed_on_start:
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            seed_demo(db)
        finally:
            db.close()
    yield


app = FastAPI(title="Вязь", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(workspaces.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(edges.router, prefix="/api/v1")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
