from pydantic import BaseModel, Field, EmailStr
import re

class Phone(BaseModel):
    number: str

    @field_validator('number')
    def validate_e164(cls, v):
        # Basic E.164 regex
        pattern = r'^\+[1-9]\d{1,14}$'
        if not re.match(pattern, v):
            raise ValueError('Invalid phone number format. Must be E.164 (e.g., +573001234567)')
        return v

class Email(BaseModel):
    address: EmailStr
