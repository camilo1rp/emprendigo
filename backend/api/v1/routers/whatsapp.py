from fastapi import APIRouter, Depends, status, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from backend.core.database import get_db
from backend.api.v1.routers.auth import get_current_user
from backend.infrastructure.persistence.models import AuthUser
from backend.api.v1.schemas.whatsapp_schemas import ConversationResponse, MessageResponse, SendMessageRequest
from backend.infrastructure.repositories.conversation_repository import ConversationRepository, MessageRepository
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.infrastructure.external.meta_cloud_api import MetaCloudAPIClient
from backend.application.whatsapp.use_cases import SendMessageUseCase, ProcessIncomingMessageUseCase
from backend.infrastructure.persistence.models import Tenant
from sqlalchemy import select

router = APIRouter()

# --- Webhook Endpoints ---

@router.get("/webhook")
async def verify_webhook(
    request: Request
):
    """
    Meta (Facebook) calls this to verify the webhook.
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    # In a real multi-tenant system, verification token might be global or we need to find tenant?
    # Usually we configure ONE webhook URL for the App in Meta Developer Portal.
    # So we use a global verify token for the App.
    # Tenants don't set this up individually in Meta usually if using Tech Provider mode.
    # Or if using manual setup, they point to this URL.
    # We will assume a global verify token for the backend.
    
    from backend.core.config import settings
    VERIFY_TOKEN = getattr(settings, "WHATSAPP_VERIFY_TOKEN", "emprendigo_verify_token")

    if mode and token:
        if mode == "subscribe" and token == VERIFY_TOKEN:
            return Response(content=challenge, media_type="text/plain", status_code=200)
        else:
            raise HTTPException(status_code=403, detail="Verification failed")
    
    return Response(content="Missing parameters", status_code=400)

@router.post("/webhook")
async def receive_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Receive incoming messages.
    """
    payload = await request.json()
    
    # Identify tenant
    try:
        entry = payload.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        phone_number_id = value.get("metadata", {}).get("phone_number_id")
    except IndexError:
        return Response(content="Event ignored", status_code=200) # Acknowledgement
        
    if not phone_number_id:
        return Response(content="No phone ID", status_code=200)

    # Find tenant by phone_number_id
    # We need to implement get_by_whatsapp_phone_number_id in TenantRepo or ad-hoc query
    query = select(Tenant).where(Tenant.whatsapp_phone_number_id == phone_number_id)
    result = await db.execute(query)
    tenant = result.scalar_one_or_none()
    
    if not tenant:
        # Log error or ignore
        return Response(content="Tenant not found", status_code=200)

    # Process Message
    tenant_repo = TenantRepository(db)
    customer_repo = CustomerRepository(db)
    conversation_repo = ConversationRepository(db)
    message_repo = MessageRepository(db)
    
    use_case = ProcessIncomingMessageUseCase(
        tenant_repo, customer_repo, conversation_repo, message_repo
    )
    
    await use_case.execute(tenant.id, payload)
    
    return Response(content="OK", status_code=200)


# --- Conversation Endpoints ---

@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    skip: int = 0,
    limit: int = 50,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = ConversationRepository(db)
    return await repo.get_active_conversations(current_user.tenant_id, skip, limit)

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: UUID,
    limit: int = 50,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    repo = MessageRepository(db)
    # TODO: Verify conversation belongs to tenant
    return await repo.get_by_conversation(conversation_id, limit)

@router.post("/conversations/{conversation_id}/messages", response_model=MessageResponse)
async def send_message(
    conversation_id: UUID,
    data: SendMessageRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Dependencies
    tenant_repo = TenantRepository(db)
    conversation_repo = ConversationRepository(db)
    message_repo = MessageRepository(db)
    customer_repo = CustomerRepository(db)
    meta_client = MetaCloudAPIClient()
    
    use_case = SendMessageUseCase(tenant_repo, conversation_repo, message_repo, customer_repo, meta_client)
    return await use_case.execute(current_user.tenant_id, conversation_id, data.content)
