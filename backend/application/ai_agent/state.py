from typing import TypedDict, Annotated, List, Optional
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage

class IntentData(TypedDict):
    category: str  # GREETING, INFO_QUERY, BOOKING_INTENT, CANCELLATION, UNKNOWN
    confidence: float
    entities: dict

class BookingContext(TypedDict):
    service_id: Optional[str]
    service_name: Optional[str]
    datetime_slot: Optional[str]
    customer_email: Optional[str]
    customer_phone: Optional[str]
    notes: Optional[str]
    step: str # SELECT_SERVICE, SELECT_TIME, CONFIMATION

class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    tenant_id: str
    customer_id: str
    intent: Optional[IntentData]
    booking_context: Optional[BookingContext]
    next_node: Optional[str]
    error: Optional[str]
