import pytest
from httpx import AsyncClient, ASGITransport
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from backend.core.config import settings
from backend.core.database import Base, get_db
from backend.main import app

settings.DATABASE_URL = "postgresql+asyncpg://postgres:postgres@db:5432/emprendigo"
# Use a separate test DB or same one? For integration tests usually a separate one.
# For MVP local dev, we might use the same but drop tables? Risk of data loss.
# Better to use SQLite in-memory for unit/fast integration or valid Postgres.
# Since we depend on UUID and Postgres specific types (JSONB, etc.), stick to Postgres.
# Assumption: User has a running Postgres. We will use the same URL but maybe different DB name if possible?
# Or just rely on transactions rollback.


# Transaction-based rollback fixture
@pytest.fixture(scope="function", autouse=True)
async def setup_db() -> AsyncGenerator[None, None]:
    engine = create_async_engine(settings.DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture(scope="function")
async def session() -> AsyncGenerator[AsyncSession, None]:
    # Connect
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
    )

    async with async_session() as session:
        yield session


@pytest.fixture(scope="function")
def override_get_db(session: AsyncSession):
    async def _override_get_db():
        yield session

    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides[get_db] = None


@pytest.fixture(scope="function")
async def client(override_get_db) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
