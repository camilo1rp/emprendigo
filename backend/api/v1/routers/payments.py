from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from typing import List

from backend.core.database import get_db
from backend.api.v1.routers.auth import get_current_user
from backend.infrastructure.persistence.models import AuthUser
from backend.api.v1.schemas.payment_schemas import PaymentProofUpload, PaymentVerificationRequest
from backend.api.v1.schemas.booking_schemas import BookingResponse
from backend.infrastructure.repositories.payment_repository import PaymentRepository
from backend.infrastructure.repositories.booking_repository import BookingRepository
from backend.application.payment.use_cases import UploadPaymentProofUseCase, VerifyPaymentUseCase

router = APIRouter()

@router.post("/{booking_id}/proof", response_model=BookingResponse)
async def upload_payment_proof(
    booking_id: UUID,
    data: PaymentProofUpload,
    # Customer can upload? Or usually public link or authenticated customer?
    # For now, let's assume authenticated user or allow open based on token?
    # MVP: Authenticated User (AuthUser) or we rely on Agent flow calling this with user context.
    # If customer uploads via Web App they are authenticated.
    # If via WhatsApp, the Agent/Webhook handler calls the UseCase directly, not via HTTP API.
    # This API is for the Web App / Admin Panel.
    current_user: AuthUser = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    repo = PaymentRepository(db)
    use_case = UploadPaymentProofUseCase(repo)
    return await use_case.execute(booking_id, data.model_dump())

@router.post("/{booking_id}/verify", response_model=BookingResponse)
async def verify_payment(
    booking_id: UUID,
    data: PaymentVerificationRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Only Admin/Staff
    # if current_user.role != "owner": raise ...
    
    payment_repo = PaymentRepository(db)
    booking_repo = BookingRepository(db)
    use_case = VerifyPaymentUseCase(payment_repo, booking_repo)
    return await use_case.execute(booking_id, data.verified, data.rejection_reason)
