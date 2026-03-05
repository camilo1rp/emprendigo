import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4


@pytest.mark.asyncio
async def test_send_message_use_case():
    from backend.application.whatsapp.use_cases import SendMessageUseCase

    mock_tenant_repo = AsyncMock()
    mock_conv_repo = AsyncMock()
    mock_msg_repo = AsyncMock()
    mock_meta_client = AsyncMock()

    tenant_id = uuid4()
    conv_id = uuid4()

    # Setup Mocks
    mock_conversation = MagicMock()
    mock_conversation.tenant_id = tenant_id
    mock_conversation.customer.phone = "573001234567"
    mock_conv_repo.get_by_id.return_value = mock_conversation

    mock_tenant = MagicMock()
    mock_tenant.whatsapp_access_token = "valid_token"
    mock_tenant.whatsapp_phone_number_id = "phone_id_123"
    mock_tenant_repo.get_by_id.return_value = mock_tenant

    mock_meta_client.send_message.return_value = {"messages": [{"id": "wamid.success"}]}

    mock_msg_repo.create.return_value = MagicMock(id=uuid4())

    use_case = SendMessageUseCase(
        tenant_repo=mock_tenant_repo,
        conversation_repo=mock_conv_repo,
        message_repo=mock_msg_repo,
        meta_client=mock_meta_client,
    )

    result = await use_case.execute(tenant_id, conv_id, "Test Message")

    # Verify Meta API Client called correctly
    mock_meta_client.send_message.assert_called_once_with(
        access_token="valid_token",
        phone_number_id="phone_id_123",
        to="573001234567",
        text_body="Test Message",
    )

    # Verify message was saved
    mock_msg_repo.create.assert_called_once()
    create_args = mock_msg_repo.create.call_args[0][0]
    assert create_args["content"] == "Test Message"
    assert create_args["direction"] == "OUTBOUND"
    assert create_args["status"] == "SENT"
    assert create_args["whatsapp_message_id"] == "wamid.success"
