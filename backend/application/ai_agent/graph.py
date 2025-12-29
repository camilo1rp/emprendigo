from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from backend.application.ai_agent.state import AgentState
from backend.application.ai_agent.nodes.intent import intent_classifier_node
from backend.application.ai_agent.nodes.info import information_node
from backend.application.ai_agent.nodes.booking import booking_node

def route_intent(state: AgentState):
    intent = state.get("intent", {}).get("category", "UNKNOWN")
    
    if intent == "INFO_QUERY":
        return "info_node"
    elif intent == "BOOKING_INTENT":
        return "booking_node"
    elif intent == "GREETING":
        return "info_node" # Greeting handled by info often or simple response
    else:
        return "info_node" # Default fallback

def build_agent_graph():
    workflow = StateGraph(AgentState)
    
    # Add Nodes
    workflow.add_node("intent_classifier", intent_classifier_node)
    workflow.add_node("info_node", information_node)
    workflow.add_node("booking_node", booking_node)
    
    # Add Edges
    workflow.set_entry_point("intent_classifier")
    
    workflow.add_conditional_edges(
        "intent_classifier",
        route_intent,
        {
            "info_node": "info_node",
            "booking_node": "booking_node"
        }
    )
    
    workflow.add_edge("info_node", END)
    
    # Booking Loop
    # If booking is not complete, loop back?
    # For now, simplistic flow: Node returns response, wait for user next message.
    workflow.add_edge("booking_node", END)
    
    # Checkpointer
    memory = MemorySaver()
    
    return workflow.compile(checkpointer=memory)

agent_graph = build_agent_graph()
