from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from backend.core.database import get_db
from backend.api.v1.routers.auth import get_current_user
from backend.infrastructure.persistence.models import AuthUser
from backend.api.v1.schemas.booking_schemas import BookingCreate, BookingResponse
from backend.infrastructure.repositories.booking_repository import BookingRepository
from backend.infrastructure.repositories.service_repository import ServiceRepository
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.infrastructure.external.cal_com_api import CalComAPIClient
from backend.application.booking.use_cases import (
    CreateBookingUseCase,
    ApproveBookingUseCase,
    RejectBookingUseCase,
    CancelBookingUseCase,
    GetBookingsQuery
)

router = APIRouter()

async def get_cal_com_client():
    client = CalComAPIClient()
    try:
        yield client
    finally:
        await client.close()

@router.get("/", response_model=List[BookingResponse])
async def get_bookings(
    status: Optional[str] = None,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    query = GetBookingsQuery(booking_repo)
    return await query.execute(current_user.tenant_id, status)

@router.post("/", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    data: BookingCreate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    service_repo = ServiceRepository(db)
    customer_repo = CustomerRepository(db)
    
    use_case = CreateBookingUseCase(booking_repo, service_repo, customer_repo)
    return await use_case.execute(current_user.tenant_id, data)

@router.post("/{booking_id}/approve", response_model=BookingResponse)
async def approve_booking(
    booking_id: UUID,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cal_com_client: CalComAPIClient = Depends(get_cal_com_client)
):
    booking_repo = BookingRepository(db)
    tenant_repo = TenantRepository(db)
    customer_repo = CustomerRepository(db)
    
    use_case = ApproveBookingUseCase(booking_repo, tenant_repo, customer_repo, cal_com_client)
    return await use_case.execute(booking_id)

@router.post("/{booking_id}/reject", response_model=BookingResponse)
async def reject_booking(
    booking_id: UUID,
    reason: str = "Host rejected",
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    booking_repo = BookingRepository(db)
    use_case = RejectBookingUseCase(booking_repo)
    return await use_case.execute(booking_id, reason)

@router.post("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_id: UUID,
    reason: str = "Host cancelled",
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    cal_com_client: CalComAPIClient = Depends(get_cal_com_client)
):
    booking_repo = BookingRepository(db)
    tenant_repo = TenantRepository(db)
    
    use_case = CancelBookingUseCase(booking_repo, tenant_repo, cal_com_client)
    return await use_case.execute(booking_id, reason)
