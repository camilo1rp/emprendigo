from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import Booking
from uuid import UUID
from typing import List, Optional
from datetime import datetime

class BookingRepository(BaseRepository[Booking]):
    def __init__(self, session: AsyncSession):
        super().__init__(Booking, session)

    async def get_by_status(self, tenant_id: UUID, status: str) -> List[Booking]:
        query = select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.status == status
        )
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_upcoming(self, tenant_id: UUID) -> List[Booking]:
        now = datetime.utcnow()
        query = select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.start_time >= now,
            Booking.status != "CANCELLED",
            Booking.status != "REJECTED"
        ).order_by(Booking.start_time)
        result = await self.session.execute(query)
        return result.scalars().all()
    
    async def get_conflicting_bookings(self, tenant_id: UUID, start_time: datetime, end_time: datetime) -> List[Booking]:
        # Overlap check: (StartA < EndB) and (EndA > StartB)
        query = select(Booking).where(
            Booking.tenant_id == tenant_id,
            Booking.status != "CANCELLED",
            Booking.status != "REJECTED",
            Booking.start_time < end_time,
            Booking.end_time > start_time
        )
        result = await self.session.execute(query)
        return result.scalars().all()
