import httpx
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class CalComAPIError(Exception):
    pass

class CalComAPIClient:
    BASE_URL = "https://api.cal.com/v1"

    def __init__(self):
        self.client = httpx.AsyncClient(base_url=self.BASE_URL, timeout=10.0)

    async def close(self):
        await self.client.aclose()

    async def validate_api_key(self, api_key: str) -> bool:
        """Validates the API key by fetching the current user/me."""
        try:
            response = await self.client.get(
                "/me",
                params={"apiKey": api_key}
            )
            return response.status_code == 200
        except httpx.RequestError:
            return False

    async def get_event_types(self, api_key: str) -> List[Dict[str, Any]]:
        """Fetches available event types for the user."""
        try:
            response = await self.client.get(
                "/event-types",
                params={"apiKey": api_key}
            )
            if response.status_code != 200:
                raise CalComAPIError(f"Failed to fetch event types: {response.text}")
            
            data = response.json()
            return data.get("event_types", [])
        except httpx.RequestError as e:
            raise CalComAPIError(f"Connection error: {str(e)}")

    async def create_booking(
        self,
        api_key: str,
        event_type_id: int,
        start_time: str, # ISO 8601
        attendee_name: str,
        attendee_email: str,
        attendee_phone: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Creates a booking in Cal.com."""
        payload = {
            "eventTypeId": event_type_id,
            "start": start_time,
            "responses": {
                "name": attendee_name,
                "email": attendee_email,
                "phone": attendee_phone,
                "notes": "Booking via Emprendigo"
            },
            "metadata": metadata or {},
            "timeZone": "America/Bogota", # Defaulting for this project
            "language": "es"
        }

        try:
            response = await self.client.post(
                "/bookings",
                params={"apiKey": api_key},
                json=payload
            )
            
            if response.status_code not in (200, 201):
                raise CalComAPIError(f"Failed to create booking: {response.text}")
            
            return response.json()
        except httpx.RequestError as e:
            raise CalComAPIError(f"Connection error: {str(e)}")

    async def delete_booking(self, api_key: str, booking_uid: str, reason: str = "User cancellation") -> bool:
        """Cancels a booking in Cal.com."""
        try:
            # Note: Cal.com API for cancellation might vary, using /bookings/{id}/cancel pattern or similar
            # Checking docs (standard pattern usually DELETE or POST /cancel)
            # Assuming Delete /bookings/{id} or similar. 
            # Using generic /bookings/{id}/cancel based on common patterns if DELETE is not standard.
            # Official docs say DELETE /bookings/{id} with reasoning.
            
            response = await self.client.delete(
                f"/bookings/{booking_uid}",
                params={"apiKey": api_key},
                json={"reason": reason}
            )
            
            return response.status_code == 200
        except httpx.RequestError as e:
            raise CalComAPIError(f"Connection error: {str(e)}")
