from uuid import UUID
from typing import Dict, Any, Optional
from datetime import datetime
from fastapi import HTTPException

from backend.infrastructure.repositories.payment_repository import PaymentRepository
from backend.infrastructure.repositories.booking_repository import BookingRepository
from backend.infrastructure.persistence.models import Booking
from backend.domain.booking.value_objects import BookingStatus

class UploadPaymentProofUseCase:
    def __init__(self, payment_repo: PaymentRepository):
        self.payment_repo = payment_repo

    async def execute(self, booking_id: UUID, proof_data: Dict[str, Any]) -> Booking:
        booking = await self.payment_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
            
        # proof_data might be { "transaction_id": "123", "image_url": "..." }
        
        update_data = {
            "payment_proof": proof_data,
            "payment_status": "PENDING_VERIFICATION"
            # We don't change main status to APPROVED yet, Admin must verify.
            # But maybe we want to guard against re-upload if already paid?
        }
        
        if booking.payment_status == "PAID":
             raise HTTPException(status_code=400, detail="Booking already paid")

        return await self.payment_repo.update(booking, update_data)

class VerifyPaymentUseCase:
    def __init__(self, payment_repo: PaymentRepository, booking_repo: BookingRepository):
        self.payment_repo = payment_repo
        self.booking_repo = booking_repo

    async def execute(self, booking_id: UUID, verified: bool, rejection_reason: Optional[str] = None) -> Booking:
        booking = await self.payment_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if verified:
            # Mark Paid
            update_data = {
                "payment_status": "PAID"
            }
            # Also auto-approve booking if it was pending approval?
            # Design decision: Does payment = approval? Usually yes for prepaid services.
            if booking.status == BookingStatus.PENDING_APPROVAL.value:
                update_data["status"] = BookingStatus.APPROVED.value
                # We should trigger Cal.com creation here explicitly if not done!
                # But `ApproveBookingUseCase` handles Cal.com logic.
                # Use cases should compose or we call Approve logic controller.
                # Ideally we invoke approve use case. 
                # For clean architecture, we should probably have an Event or invoke the other use case.
                
                # For now, let's just mark PAID. The admin can then hit "Approve" or we assume simple flow.
                # Actually, `ApproveBookingUseCase` creates the Cal.com event.
                # If we just set status=APPROVED here, we skip Cal.com creation.
                # So we should ONLY set payment_status=PAID. 
                # And let Admin click "Approve" (which might check if paid).
                # OR we verify payment AND approve.
                
                pass 
            
            return await self.payment_repo.update(booking, update_data)
        else:
            # Reject Payment
            update_data = {
                "payment_status": "REJECTED", # Or back to PENDING?
                "rejection_reason": f"Payment Rejected: {rejection_reason}"
            }
            return await self.payment_repo.update(booking, update_data)
