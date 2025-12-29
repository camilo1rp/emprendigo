from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import Service
from uuid import UUID
from typing import List

class ServiceRepository(BaseRepository[Service]):
    def __init__(self, session: AsyncSession):
        super().__init__(Service, session)

    async def get_by_tenant(self, tenant_id: UUID, active_only: bool = False) -> List[Service]:
        query = select(Service).where(Service.tenant_id == tenant_id)
        if active_only:
            query = query.where(Service.is_active == True)
        query = query.order_by(Service.display_order)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def name_exists(self, tenant_id: UUID, name: str) -> bool:
        query = select(Service).where(
            Service.tenant_id == tenant_id,
            Service.name == name
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None
