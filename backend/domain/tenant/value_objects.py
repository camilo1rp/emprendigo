from pydantic import BaseModel, Field, EmailStr, HttpUrl
from typing import Optional

class WhatsAppConfig(BaseModel):
    phone_number: str
    phone_number_id: str
    access_token: str
    waba_id: str
    webhook_verify_token: str

    def is_valid(self) -> bool:
        return all([
            self.phone_number,
            self.phone_number_id,
            self.access_token,
            self.waba_id,
            self.webhook_verify_token
        ])

class CalComConfig(BaseModel):
    api_key: str
    username: str

    def is_valid(self) -> bool:
        return bool(self.api_key and self.username)

class BrandSettings(BaseModel):
    primary_color: str = "#000000"
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    font_family: str = "Inter"

    @staticmethod
    def get_default() -> "BrandSettings":
        return BrandSettings()
