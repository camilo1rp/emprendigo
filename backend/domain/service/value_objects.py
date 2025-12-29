from pydantic import BaseModel, Field, field_validator
from decimal import Decimal

class Duration(BaseModel):
    minutes: int = Field(..., gt=0)

    @field_validator('minutes')
    def validate_minutes(cls, v):
        if v < 15 or v > 480: # 15 min to 8 hours
            raise ValueError('Duration must be between 15 minutes and 8 hours')
        return v

    def format_display(self) -> str:
        hours = self.minutes // 60
        mins = self.minutes % 60
        if hours > 0:
            return f"{hours}h {mins}m" if mins > 0 else f"{hours}h"
        return f"{mins}m"

class Price(BaseModel):
    amount: Decimal = Field(..., ge=0)
    currency: str = "COP"

    def format_display(self) -> str:
        return f"${self.amount:,.0f} {self.currency}"
