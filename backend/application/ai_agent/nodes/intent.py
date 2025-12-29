from langchain_core.prompts import ChatPromptTemplate
from langchain_core.pydantic_v1 import BaseModel, Field
from backend.application.ai_agent.state import AgentState, IntentData
from backend.application.ai_agent.llm_factory import LLMFactory

class IntentOutput(BaseModel):
    category: str = Field(description="One of: GREETING, INFO_QUERY, BOOKING_INTENT, CANCELLATION, UNKNOWN")
    reasoning: str = Field(description="Short reason for classification")

def intent_classifier_node(state: AgentState) -> dict:
    messages = state["messages"]
    
    # We only care about the last message for intent usually, or history?
    # History is good for context but last message is trigger.
    
    llm = LLMFactory.create_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(IntentOutput)
    
    system_prompt = """You are an helpful assistant for a small business. 
    Classify the user's intent based on their message history.
    
    Categories:
    - GREETING: Simple hellos, goodbyes.
    - INFO_QUERY: Asking about prices, services, hours, location.
    - BOOKING_INTENT: Explicitly wanting to schedule, book, or reserve.
    - CANCELLATION: Wanting to cancel or reschedule existing booking.
    - UNKNOWN: Irrelevant or confusing input.
    """
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        ("placeholder", "{messages}")
    ])
    
    chain = prompt | structured_llm
    
    try:
        result = chain.invoke({"messages": messages})
        category = result.category
    except Exception:
        category = "UNKNOWN"
        
    return {
        "intent": {
            "category": category,
            "confidence": 1.0, 
            "entities": {}
        }
    }
