from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime

from backend.infrastructure.repositories.conversation_repository import ConversationRepository, MessageRepository
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.infrastructure.external.meta_cloud_api import MetaCloudAPIClient
from backend.domain.conversation.value_objects import MessageDirection, MessageType
from backend.infrastructure.persistence.models import Message, Conversation
from fastapi import HTTPException

class SendMessageUseCase:
    def __init__(
        self,
        tenant_repo: TenantRepository,
        conversation_repo: ConversationRepository,
        message_repo: MessageRepository,
        meta_client: MetaCloudAPIClient
    ):
        self.tenant_repo = tenant_repo
        self.conversation_repo = conversation_repo
        self.message_repo = message_repo
        self.meta_client = meta_client

    async def execute(self, tenant_id: UUID, conversation_id: UUID, text: str) -> Message:
        conversation = await self.conversation_repo.get_by_id(conversation_id)
        if not conversation or conversation.tenant_id != tenant_id:
            raise HTTPException(status_code=404, detail="Conversation not found")
            
        tenant = await self.tenant_repo.get_by_id(tenant_id)
        
        if not tenant.whatsapp_access_token:
            raise HTTPException(status_code=400, detail="WhatsApp not connected")

        # Reuse customer logic if simple message, or template if needed.
        # Assuming simple text message (requires customer to be within 24h window or using template?)
        # For simplicity MVP: Try sending text. If failed due to window, we should handle error.
        # But actually, Meta requires Templates for business initiated.
        # However, if it's a reply to an active conversation, text is fine.
        # We assume active window for now.
        
        customer = conversation.customer # Lazy load warning again.
        # Assuming customer is reachable.
        
        # We need customer phone.
        # And customer object might not be loaded.
        # But conversation.customer relationship should work if session active.
        
        try:
             # Using customer relationship from conversation
             phone = conversation.customer.phone
             
             api_res = await self.meta_client.send_message(
                 access_token=tenant.whatsapp_access_token,
                 phone_number_id=tenant.whatsapp_phone_number_id,
                 to=phone,
                 text_body=text
             )
             
             whatsapp_msg_id = api_res.get("messages", [{}])[0].get("id")
             
             # Save Message
             message_data = {
                 "conversation_id": conversation_id,
                 "direction": MessageDirection.OUTBOUND.value,
                 "message_type": MessageType.TEXT.value,
                 "content": text,
                 "whatsapp_message_id": whatsapp_msg_id,
                 "status": "SENT"
             }
             
             message = await self.message_repo.create(message_data)
             
             # Update conversation last message
             await self.conversation_repo.update(conversation, {"last_message_at": datetime.utcnow()})
             
             return message
             
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"WhatsApp Error: {str(e)}")

class ProcessIncomingMessageUseCase:
    def __init__(
        self,
        tenant_repo: TenantRepository,
        customer_repo: CustomerRepository,
        conversation_repo: ConversationRepository,
        message_repo: MessageRepository
    ):
        self.tenant_repo = tenant_repo
        self.customer_repo = customer_repo
        self.conversation_repo = conversation_repo
        self.message_repo = message_repo

    async def execute(self, tenant_id: UUID, payload: Dict[str, Any]):
        # Parse payload
        entry = payload.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        contacts = value.get("contacts", [])
        
        if not messages:
            return # Status update or other event
            
        msg_data = messages[0]
        from_phone = msg_data.get("from")
        msg_type = msg_data.get("type")
        msg_body = ""
        
        if msg_type == "text":
            msg_body = msg_data.get("text", {}).get("body")
        else:
            msg_body = f"[{msg_type} message]"
            
        # Find Tenant (We assume webhook is unique per tenant OR we identify tenant by phone_number_id)
        # In this multi-tenant MVP, we might receive events for multiple tenants if we use one WABA?
        # OR each tenant has their own config.
        # If we use one App for multiple tenants, we receive all webhooks at one endpoint.
        # We need to identify tenant by `value.metadata.phone_number_id`.
        
        phone_number_id = value.get("metadata", {}).get("phone_number_id")
        
        # Need to find tenant by phone_number_id
        # We don't have get_by_whatsapp_id in TenantRepo yet.
        # For MVP, let's assume valid tenant passed if we were calling this use case after lookup.
        # But this use case is called by Webhook handler which needs to find tenant.
        
        # Let's delegate tenant finding to the caller/controller?
        # Or add method to TenantRepo.
        # We'll assume the controller finds the tenant_id or we pass it in.
        
        # Find/Create Customer
        customer = await self.customer_repo.get_by_phone(tenant_id, from_phone) # Normalize phone?
        # WhatsApp sends ID without +, our DB might have + ?
        # Meta usually sends '7999...', our DB might be '+7999' or '7999'.
        # We need to handle this. For MVP assume exact match or simple stripping.
        
        if not customer:
            # Create new customer
            contact_name = contacts[0].get("profile", {}).get("name", "Unknown")
            customer_data = {
                "tenant_id": tenant_id,
                "first_name": contact_name,
                "last_name": "",
                "phone": from_phone,
                "whatsapp_optin": True,
                "source": "WHATSAPP"
            }
            customer = await self.customer_repo.create(customer_data)
            
        # Find/Create Conversation
        conversation = await self.conversation_repo.get_by_customer(tenant_id, customer.id)
        if not conversation:
            conversation = await self.conversation_repo.create({
                "tenant_id": tenant_id,
                "customer_id": customer.id,
                "status": "ACTIVE"
            })
            
        # Create Message
        await self.message_repo.create({
            "conversation_id": conversation.id,
            "direction": MessageDirection.INBOUND.value,
            "message_type": msg_type,
            "content": msg_body,
            "whatsapp_message_id": msg_data.get("id"),
            "metadata_json": msg_data,
            "status": "DELIVERED"
        })
        
        # Update conversation status
        await self.conversation_repo.update(conversation, {
            "last_message_at": datetime.utcnow(),
            "unread_count": conversation.unread_count + 1
        })

        # --- AI AGENT INTEGRATION ---
        from backend.application.ai_agent.graph import agent_graph
        from langchain_core.messages import HumanMessage
        
        # Prepare state
        # Helper to get history... skipping for MVP speed, passing current message
        # In real app, we fetch last k messages from DB and convert to BaseMessage
        
        # Config for Checkpoint (using conversation_id as thread_id)
        config = {"configurable": {"thread_id": str(conversation.id)}}
        
        initial_state = {
            "messages": [HumanMessage(content=msg_body)],
            "tenant_id": str(tenant_id),
            "customer_id": str(customer.id),
            "tenant_config": {}, # Pass overrides here if needed
            "intent": None,
            "booking_context": None # Checkpoint persistence handles this ideally
        }
        
        # Run Graph
        # Note: ainvoke might block if LLM is slow. 
        # Ideally this should be a background task (see Celery/Arq in Roadmap).
        # For MVP we run inline.
        try:
            output = await agent_graph.ainvoke(initial_state, config=config)
            
            # Extract Response
            final_messages = output.get("messages", [])
            if final_messages:
                last_msg = final_messages[-1]
                response_text = last_msg.content
                
                # Send Reply via Meta Cloud API
                # We need `SendMessageUseCase` logic here or reuse it.
                # To avoid circular dep or code dup, simpler to use client directly or extract `_send_whatsapp` method.
                # Or Instantiate SendMessageUseCase (requires deps).
                
                # Instantiating Meta Client for reply
                meta_client = MetaCloudAPIClient() 
                try:
                    # Fetch tenant token again or reuse if passed... 
                    # We have `tenant` loaded in memory? No we fetched `tenant_id`.
                    # Need to fetch tenant entity for tokens.
                    tenant_entity = await self.tenant_repo.get_by_id(tenant_id)

                    if tenant_entity and tenant_entity.whatsapp_access_token:
                        await meta_client.send_message(
                            access_token=tenant_entity.whatsapp_access_token,
                            phone_number_id=tenant_entity.whatsapp_phone_number_id,
                            to=customer.phone, # Assuming clean phone
                            text_body=response_text
                        )
                        
                        # Save Bot Message
                        await self.message_repo.create({
                            "conversation_id": conversation.id,
                            "direction": MessageDirection.OUTBOUND.value,
                            "message_type": MessageType.TEXT.value,
                            "content": response_text,
                            "status": "SENT"
                        })
                finally:
                    await meta_client.close()
                    
        except Exception as e:
            # Fallback or Log
            print(f"Agent Error: {e}")
            # Optionally send generic error message to user
