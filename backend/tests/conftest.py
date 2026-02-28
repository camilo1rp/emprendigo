import pytest
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from httpx import AsyncClient, ASGITransport

from backend.core.config import settings
from backend.core.database import Base, get_db
from backend.main import app

# Use a separate test DB or same one? For integration tests usually a separate one.
# For MVP local dev, we might use the same but drop tables? Risk of data loss.
# Better to use SQLite in-memory for unit/fast integration or valid Postgres.
# Since we depend on UUID and Postgres specific types (JSONB, etc.), stick to Postgres.
# Assumption: User has a running Postgres. We will use the same URL but maybe different DB name if possible?
# Or just rely on transactions rollback.

# Transaction-based rollback fixture
@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(settings.DATABASE_URL)
    connection = await engine.connect()
    transaction = await connection.begin()
    
    async_session = AsyncSession(bind=connection, expire_on_commit=False)
    
    yield async_session
    
    await transaction.rollback()
    await connection.close()
    await engine.dispose()

@pytest.fixture
def override_get_db(session: AsyncSession):
    async def _override_get_db():
        yield session
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides[get_db] = None

@pytest.fixture
async def client(override_get_db) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
