from pydantic import BaseModel, Field, EmailStr
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime

class TenantUpdate(BaseModel):
    business_name: Optional[str] = None
    description: Optional[str] = None
    phone: Optional[str] = None
    brand_settings: Optional[Dict[str, Any]] = None
    
    # Configs
    whatsapp_phone_number: Optional[str] = None
    nequi_number: Optional[str] = None
    daviviplata_number: Optional[str] = None

class TenantResponse(BaseModel):
    id: UUID
    slug: str
    business_name: str
    description: Optional[str] = None
    email: EmailStr
    phone: Optional[str] = None
    status: str
    onboarding_completed: bool
    brand_settings: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
