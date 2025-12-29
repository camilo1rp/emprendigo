from langchain_core.prompts import ChatPromptTemplate
from langchain_core.pydantic_v1 import BaseModel, Field
from backend.application.ai_agent.state import AgentState, BookingContext
from backend.application.ai_agent.llm_factory import LLMFactory
from backend.infrastructure.repositories.service_repository import ServiceRepository
from backend.infrastructure.repositories.booking_repository import BookingRepository
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.core.database import SessionLocal
from uuid import UUID
from datetime import datetime
from typing import Optional

# Helper to fetch services
async def get_services_list(tenant_id: UUID):
    async with SessionLocal() as db:
        repo = ServiceRepository(db)
        return await repo.get_by_tenant(tenant_id, active_only=True)

class BookingExtraction(BaseModel):
    service_name: Optional[str] = Field(description="Name of the service user wants")
    datetime_slot: Optional[str] = Field(description="Desired date and time formatted comfortably")
    notes: Optional[str] = Field(description="Any special requests")

async def booking_node(state: AgentState) -> dict:
    messages = state["messages"]
    tenant_id = UUID(state["tenant_id"])
    context = state.get("booking_context") or {}
    
    # Logic: 
    # 1. Identify missing information (Service, Time).
    # 2. Ask user for missing info.
    # 3. If all info present, check availability (Mocked for now or simple check).
    # 4. Propose slot or confirm.
    
    services = await get_services_list(tenant_id)
    service_names = [s.name for s in services]
    
    llm = LLMFactory.create_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(BookingExtraction)
    
    extraction_prompt = f"""Extract booking details from the conversation.
    Available Services: {", ".join(service_names)}
    
    Current known context: {context}
    """
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", extraction_prompt),
        ("placeholder", "{messages}")
    ])
    
    chain = prompt | structured_llm
    try:
        extraction = await chain.ainvoke({"messages": messages})
    except:
        extraction = BookingExtraction()
        
    s_name = extraction.service_name or context.get("service_name")
    dt_slot = extraction.datetime_slot or context.get("datetime_slot")
    notes = extraction.notes or context.get("notes")
    
    # Update Context
    new_context = {
        "service_name": s_name,
        "datetime_slot": dt_slot,
        "notes": notes,
        "step": "IN_PROGRESS"
    }

    response_text = ""
    
    if not s_name:
        response_text = f"Which service would you like to book? We have: {', '.join(service_names)}."
    elif not dt_slot:
        response_text = f"Great, for {s_name}. When would you like to come?"
    else:
        # We have both. 
        # Check Price
        selected_service = next((s for s in services if s.name == s_name), None)
        price = selected_service.price_amount if selected_service else 0
        
        if price > 0:
            # Paid service flow
            # For MVP Agent, we just say we need payment. 
            # In a real flow, we might Create Booking -> RETURN ID -> Ask for payment.
            # But the agent node here is "Parsing & Proposing".
            # The actual "Creation" happens maybe after confirmation?
            # Review graph logic: booking_node -> END. 
            # It seems we don't have a "Create Booking" node in the graph yet.
            # The Plan for Phase 5 said "Slot checking". 
            # The actual creation logic in `booking_node` was just text response "Shall I confirm?".
            # We need a "Confirmation" node or logic to actually call `CreateBookingUseCase`.
            # For Phase 6 task "Update Booking Flow", I will update the text to mention payment.
            
            response_text = f"I can book {s_name} for {dt_slot}. The price is ${price}. Please confirm to receive payment instructions."
            new_context["step"] = "CONFIRMATION"
            new_context["requires_payment"] = True
        else:
            response_text = f"I can book {s_name} for {dt_slot}. Shall I confirm this booking?"
            new_context["step"] = "CONFIRMATION"
            new_context["requires_payment"] = False

    from langchain_core.messages import AIMessage
    return {
        "booking_context": new_context,
        "messages": [AIMessage(content=response_text)]
    }
