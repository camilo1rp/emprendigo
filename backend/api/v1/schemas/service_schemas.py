from pydantic import BaseModel, Field
from uuid import UUID
from decimal import Decimal
from typing import Optional
from datetime import datetime

class ServiceBase(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None
    duration_minutes: int = Field(..., ge=15, le=480)
    price_amount: Decimal = Field(..., ge=0)
    price_currency: str = "COP"
    calcom_event_type_id: Optional[int] = None
    display_order: int = 0
    is_active: bool = True

class ServiceCreate(ServiceBase):
    pass

class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=15, le=480)
    price_amount: Optional[Decimal] = Field(None, ge=0)
    price_currency: Optional[str] = None
    calcom_event_type_id: Optional[int] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class ServiceResponse(ServiceBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
