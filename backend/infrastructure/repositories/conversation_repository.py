from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from uuid import UUID

from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import Conversation, Message

class ConversationRepository(BaseRepository[Conversation]):
    def __init__(self, session: AsyncSession):
        super().__init__(Conversation, session)

    async def get_by_customer(self, tenant_id: UUID, customer_id: UUID) -> Optional[Conversation]:
        query = select(Conversation).where(
            Conversation.tenant_id == tenant_id,
            Conversation.customer_id == customer_id
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_active_conversations(self, tenant_id: UUID, skip: int = 0, limit: int = 50) -> List[Conversation]:
        query = select(Conversation).where(
            Conversation.tenant_id == tenant_id,
        ).order_by(desc(Conversation.last_message_at)).offset(skip).limit(limit)
        
        result = await self.session.execute(query)
        return result.scalars().all()

class MessageRepository(BaseRepository[Message]):
    def __init__(self, session: AsyncSession):
        super().__init__(Message, session)
    
    async def get_by_conversation(self, conversation_id: UUID, limit: int = 50) -> List[Message]:
        query = select(Message).where(
            Message.conversation_id == conversation_id
        ).order_by(desc(Message.created_at)).limit(limit)
        
        result = await self.session.execute(query)
        # Reverse to show chronological order if needed, but descend is better for pagination usually.
        # UI usually expects descending or ascending. Let's keep desc for now.
        return result.scalars().all()
