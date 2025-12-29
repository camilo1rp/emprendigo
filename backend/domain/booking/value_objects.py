from pydantic import BaseModel, HttpUrl
from enum import Enum
from datetime import datetime
from typing import Optional

class BookingStatus(str, Enum):
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    COMPLETED = "COMPLETED"

class BookingSource(str, Enum):
    WHATSAPP = "WHATSAPP"
    WEB = "WEB"
    MANUAL = "MANUAL"

class TimeSlot(BaseModel):
    start_time: datetime
    end_time: datetime

    def duration_minutes(self) -> int:
        delta = self.end_time - self.start_time
        return int(delta.total_seconds() / 60)

class PaymentProof(BaseModel):
    transaction_id: str
    image_url: Optional[HttpUrl] = None
    amount: float
    status: str = "PENDING" # PENDING, VERIFIED, REJECTED
    provider: str = "NEQUI" # NEQUI, DAVIVIPLATA, CASH
