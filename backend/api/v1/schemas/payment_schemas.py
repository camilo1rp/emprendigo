from pydantic import BaseModel
from typing import Optional, Dict, Any
from uuid import UUID

class PaymentProofUpload(BaseModel):
    transaction_id: str
    image_url: Optional[str] = None
    notes: Optional[str] = None

class PaymentVerificationRequest(BaseModel):
    verified: bool
    rejection_reason: Optional[str] = None
