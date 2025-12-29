from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import Tenant

class TenantRepository(BaseRepository[Tenant]):
    def __init__(self, session: AsyncSession):
        super().__init__(Tenant, session)

    async def get_by_email(self, email: str) -> Tenant | None:
        query = select(Tenant).where(Tenant.email == email)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
        
    async def get_by_slug(self, slug: str) -> Tenant | None:
        query = select(Tenant).where(Tenant.slug == slug)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
