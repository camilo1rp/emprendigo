from pydantic import BaseModel, EmailStr, Field
from uuid import UUID

class TenantCreate(BaseModel):
    slug: str = Field(..., pattern="^[a-z0-9-]+$")
    business_name: str
    email: EmailStr
    password: str = Field(..., min_length=8)

class Token(BaseModel):
    access_token: str
    token_type: str

class TenantResponse(BaseModel):
    id: UUID
    slug: str
    business_name: str
    email: EmailStr
    
    class Config:
        from_attributes = True
