from pydantic import BaseModel, Field, EmailStr
from uuid import UUID
from typing import Optional
from datetime import datetime

class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    phone: str
    whatsapp_optin: bool = False
    source: Optional[str] = None
    notes: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    whatsapp_optin: Optional[bool] = None
    notes: Optional[str] = None

class CustomerResponse(CustomerBase):
    id: UUID
    tenant_id: UUID
    whatsapp_optin_date: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
