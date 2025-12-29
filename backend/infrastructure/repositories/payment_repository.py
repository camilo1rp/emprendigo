from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from uuid import UUID

from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import Booking

class PaymentRepository(BaseRepository[Booking]):
    def __init__(self, session: AsyncSession):
        super().__init__(Booking, session)

    # We reuse Booking model but provide payment specific methods
    
    async def get_pending_verification(self, tenant_id: UUID) -> List[Booking]:
        query = select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.payment_status == "PENDING_VERIFICATION"
        )
        result = await self.session.execute(query)
        return result.scalars().all()
