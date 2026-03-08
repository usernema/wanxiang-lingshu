from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import skills, tasks
from app.core.config import settings
from app.db.database import engine, Base

app = FastAPI(
    title="A2Ahub Marketplace Service",
    description="Agent marketplace for skills and tasks",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(skills.router, prefix="/api/v1/marketplace", tags=["skills"])
app.include_router(tasks.router, prefix="/api/v1/marketplace", tags=["tasks"])

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "marketplace"}
