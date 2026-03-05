import pytest
from httpx import AsyncClient
from unittest.mock import patch, AsyncMock
from backend.core.config import settings

@pytest.mark.asyncio
async def test_verify_webhook(client: AsyncClient):
    # Test correct token
    res = await client.get(
        "/api/v1/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": settings.WHATSAPP_VERIFY_TOKEN,
            "hub.challenge": "ch_12345"
        }
    )
    assert res.status_code == 200
    assert res.text == "ch_12345"

    # Test incorrect token
    res = await client.get(
        "/api/v1/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong_token",
            "hub.challenge": "ch_12345"
        }
    )
    assert res.status_code == 403

@pytest.mark.asyncio
@patch('backend.api.v1.routers.whatsapp.ProcessIncomingMessageUseCase', autospec=True)
async def test_receive_webhook_message(mock_use_case_class, client: AsyncClient):
    mock_instance = mock_use_case_class.return_value
    mock_instance.execute = AsyncMock()

    # Need a tenant in DB first, but our router looks up by phone_number_id.
    # We will just test that the router attempts to find the tenant.
    # The actual DB might not have the tenant, so it will return "Tenant not found" with 200 OK.
    
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "12345",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "1234",
                                "phone_number_id": "test_phone_id"
                            },
                            "contacts": [
                                {
                                    "profile": {"name": "Test User"},
                                    "wa_id": "573001234567"
                                }
                            ],
                            "messages": [
                                {
                                    "from": "573001234567",
                                    "id": "wamid.HBgL...",
                                    "timestamp": "1690000000",
                                    "text": {"body": "Hello"},
                                    "type": "text"
                                }
                            ]
                        },
                        "field": "messages"
                    }
                ]
            }
        ]
    }
    
    # Send webhook
    res = await client.post("/api/v1/whatsapp/webhook", json=payload)
    
    # If the tenant is not found the API returns 200 with "Tenant not found" text
    assert res.status_code == 200
    assert res.text == "Tenant not found"
    
    # We didn't execute the use case because tenant was not found.
    mock_instance.execute.assert_not_called()
