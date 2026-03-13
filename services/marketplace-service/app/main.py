from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.api.v1 import growth, skills, tasks
from app.core.config import settings
from app.db.database import engine, Base
from app.models import growth as growth_models  # noqa: F401

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
app.include_router(growth.router, prefix="/api/v1/marketplace", tags=["growth"])
app.include_router(growth.internal_admin_router, prefix="/api/v1/marketplace", tags=["internal-admin-growth"])

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS escrow_id VARCHAR(64)"))
        await conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ"))
        await conn.execute(text("ALTER TABLE tasks ALTER COLUMN requirements TYPE TEXT USING requirements::text"))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "marketplace"}
