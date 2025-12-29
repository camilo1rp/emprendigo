from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import Customer
from uuid import UUID
from typing import List, Optional

class CustomerRepository(BaseRepository[Customer]):
    def __init__(self, session: AsyncSession):
        super().__init__(Customer, session)

    async def get_by_phone(self, tenant_id: UUID, phone: str) -> Optional[Customer]:
        query = select(Customer).where(
            Customer.tenant_id == tenant_id,
            Customer.phone == phone
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_tenant(self, tenant_id: UUID, skip: int = 0, limit: int = 100) -> List[Customer]:
        query = select(Customer).where(Customer.tenant_id == tenant_id).offset(skip).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()
