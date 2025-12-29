from uuid import UUID
from typing import List, Optional
from datetime import datetime
from fastapi import HTTPException, status

from backend.infrastructure.repositories.booking_repository import BookingRepository
from backend.infrastructure.repositories.service_repository import ServiceRepository
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.infrastructure.external.cal_com_api import CalComAPIClient
from backend.api.v1.schemas.booking_schemas import BookingCreate, BookingUpdate
from backend.infrastructure.persistence.models import Booking, Tenant
from backend.domain.booking.value_objects import BookingStatus

class CreateBookingUseCase:
    def __init__(self, booking_repo: BookingRepository, service_repo: ServiceRepository, customer_repo: CustomerRepository):
        self.booking_repo = booking_repo
        self.service_repo = service_repo
        self.customer_repo = customer_repo

    async def execute(self, tenant_id: UUID, data: BookingCreate) -> Booking:
        # Verify Service
        service = await self.service_repo.get_by_id(data.service_id)
        if not service or service.tenant_id != tenant_id or not service.is_active:
            raise HTTPException(status_code=400, detail="Invalid service")
        
        # Verify Customer
        customer = await self.customer_repo.get_by_id(data.customer_id)
        if not customer or customer.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid customer")
        
        # Check Availability
        conflicts = await self.booking_repo.get_conflicting_bookings(tenant_id, data.start_time, data.end_time)
        if conflicts:
            raise HTTPException(status_code=400, detail="Time slot not available")

        # Create Booking
        booking_data = data.model_dump()
        booking_data.update({
            "tenant_id": tenant_id,
            "status": BookingStatus.PENDING_APPROVAL.value,
            "price_amount": service.price_amount,
            "price_currency": service.price_currency,
            "calcom_event_type_id": service.calcom_event_type_id
        })
        
        return await self.booking_repo.create(booking_data)

class ApproveBookingUseCase:
    def __init__(
        self,
        booking_repo: BookingRepository,
        tenant_repo: any,
        customer_repo: CustomerRepository,
        cal_com_client: CalComAPIClient
    ):
        self.booking_repo = booking_repo
        self.tenant_repo = tenant_repo
        self.customer_repo = customer_repo
        self.cal_com_client = cal_com_client

    async def execute(self, booking_id: UUID) -> Booking:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking.status == BookingStatus.APPROVED.value:
            return booking # Idempotent

        # Get Tenant for API Key
        tenant = await self.tenant_repo.get_by_id(booking.tenant_id)
        if not tenant.calcom_api_key:
             raise HTTPException(status_code=400, detail="Tenant not connected to Cal.com")
             
        # Get Customer
        customer = await self.customer_repo.get_by_id(booking.customer_id)
        if not customer:
             raise HTTPException(status_code=404, detail="Customer not found")

        # Create Cal.com Event
        try:
            api_response = await self.cal_com_client.create_booking(
                api_key=tenant.calcom_api_key,
                event_type_id=booking.calcom_event_type_id,
                start_time=booking.start_time.isoformat(),
                attendee_name=f"{customer.first_name} {customer.last_name}",
                attendee_email=customer.email,
                attendee_phone=customer.phone
            )
            
            calcom_uid = api_response.get("uid")
            calcom_id = str(api_response.get("id"))
            
            # Update Booking
            update_data = {
                "status": BookingStatus.APPROVED.value,
                "calcom_booking_id": calcom_id,
                "calcom_booking_uid": calcom_uid
            }
            return await self.booking_repo.update(booking, update_data)
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cal.com Error: {str(e)}")

class RejectBookingUseCase:
    def __init__(self, booking_repo: BookingRepository):
        self.booking_repo = booking_repo

    async def execute(self, booking_id: UUID, reason: str) -> Booking:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
            
        update_data = {
            "status": BookingStatus.REJECTED.value,
            "rejection_reason": reason
        }
        return await self.booking_repo.update(booking, update_data)

class CancelBookingUseCase:
    def __init__(self, booking_repo: BookingRepository, tenant_repo: any, cal_com_client: CalComAPIClient):
        self.booking_repo = booking_repo
        self.tenant_repo = tenant_repo
        self.cal_com_client = cal_com_client

    async def execute(self, booking_id: UUID, reason: str = "Host cancelled") -> Booking:
        booking = await self.booking_repo.get_by_id(booking_id)
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")

        if booking.status == BookingStatus.APPROVED.value and booking.calcom_booking_uid:
             # Cancel in Cal.com
             tenant = await self.tenant_repo.get_by_id(booking.tenant_id)
             if tenant and tenant.calcom_api_key:
                 await self.cal_com_client.delete_booking(
                     api_key=tenant.calcom_api_key,
                     booking_uid=booking.calcom_booking_uid,
                     reason=reason
                 )

        update_data = {
            "status": BookingStatus.CANCELLED.value,
            "rejection_reason": reason
        }
        return await self.booking_repo.update(booking, update_data)

class GetBookingsQuery:
    def __init__(self, booking_repo: BookingRepository):
        self.booking_repo = booking_repo

    async def execute(self, tenant_id: UUID, status: Optional[str] = None) -> List[Booking]:
        if status:
            return await self.booking_repo.get_by_status(tenant_id, status)
        return await self.booking_repo.get_all() # Or get_upcoming logic
