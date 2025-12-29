from langchain_core.prompts import ChatPromptTemplate
from backend.application.ai_agent.state import AgentState
from backend.application.ai_agent.llm_factory import LLMFactory
from backend.infrastructure.repositories.service_repository import ServiceRepository
from backend.core.database import SessionLocal # We need a session
from uuid import UUID

# Note: Creating a session inside a node is a bit antipattern if we want to reuse the one from request context.
# But keeping it simple for now or better inject dependencies if possible?
# LangGraph nodes are usually standalone functions.
# We will use SessionLocal for a fresh session scope per node execution on specific tasks if DB access needed.
# Better approach: Pass tools via state? Or specific helper class.
# We will create a helper to get services text.

async def get_services_context(tenant_id_str: str) -> str:
    try:
        tenant_id = UUID(tenant_id_str)
        async with SessionLocal() as db:
            repo = ServiceRepository(db)
            services = await repo.get_by_tenant(tenant_id, active_only=True)
            
            if not services:
                return "No services available."
            
            text = "Available Services:\n"
            for s in services:
                text += f"- {s.name}: {s.price_currency} {s.price_amount} ({s.duration_minutes} mins). {s.description}\n"
            return text
    except Exception as e:
         return f"Error fetching services: {str(e)}"

async def information_node(state: AgentState) -> dict:
    messages = state["messages"]
    tenant_id = state["tenant_id"]
    
    context = await get_services_context(tenant_id)
    
    llm = LLMFactory.create_llm()
    
    system_prompt = f"""You are a helpful assistant.
    Answer the user's question using the following context about the business.
    If the answer is not in the context, say you don't know but can help with booking.
    
    Context:
    {context}
    """
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("placeholder", "{messages}")
    ])
    
    chain = prompt | llm
    response = await chain.ainvoke({"messages": messages})
    
    return {"messages": [response]}
