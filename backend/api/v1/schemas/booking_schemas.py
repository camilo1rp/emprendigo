from pydantic import BaseModel, Field, EmailStr
from uuid import UUID
from datetime import datetime
from typing import Optional
from decimal import Decimal
from backend.domain.booking.value_objects import BookingStatus, BookingSource

class BookingBase(BaseModel):
    service_id: UUID
    customer_id: UUID
    start_time: datetime
    end_time: datetime
    customer_notes: Optional[str] = None

class BookingCreate(BookingBase):
    pass

class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    rejection_reason: Optional[str] = None
    calcom_booking_uid: Optional[str] = None
    calcom_booking_id: Optional[str] = None

class BookingResponse(BookingBase):
    id: UUID
    tenant_id: UUID
    status: str # Using string to avoid validation issues if enum changes
    source: str
    price_amount: Decimal
    price_currency: str
    calcom_booking_uid: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CalComConnectionRequest(BaseModel):
    api_key: str
    username: str
