from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime
from typing import Optional, List, Dict, Any
from backend.domain.conversation.value_objects import MessageDirection, MessageType

class WebhookVerification(BaseModel):
    mode: str = Field(..., alias="hub.mode")
    challenge: str = Field(..., alias="hub.challenge")
    verify_token: str = Field(..., alias="hub.verify_token")

class ConversationResponse(BaseModel):
    id: UUID
    customer_id: UUID
    last_message_at: datetime
    unread_count: int
    status: str
    
    # Include customer summary if possible? 
    # For list view we might want customer name.
    # We can add customer field if using response_model include logic or flattened.

    class Config:
        from_attributes = True

class MessageResponse(BaseModel):
    id: UUID
    conversation_id: UUID
    direction: MessageDirection
    message_type: MessageType
    content: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

class SendMessageRequest(BaseModel):
    content: str
