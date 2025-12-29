# LangGraph State Machine Design
## Colombian Small Business Booking Platform - AI Agent
### LangGraph v1.0 Implementation Guide

---

## Table of Contents
1. [Overview](#overview)
2. [LangGraph v1.0 Key Concepts](#langgraph-v10-key-concepts)
3. [State Schema Design](#state-schema-design)
4. [Base Agent Architecture](#base-agent-architecture)
5. [Node Implementations](#node-implementations)
6. [Edge Logic & Routing](#edge-logic--routing)
7. [Human-in-the-Loop (Checkpoints)](#human-in-the-loop-checkpoints)
8. [Tenant Customization Strategy](#tenant-customization-strategy)
9. [State Persistence](#state-persistence)
10. [Error Handling & Recovery](#error-handling--recovery)
11. [Implementation Specifications](#implementation-specifications)

---

## Overview

### Purpose
Create a conversational AI agent that:
- Handles WhatsApp booking conversations in Spanish
- Classifies user intent
- Collects booking information
- Requires human approval before confirming bookings
- Supports tenant-specific customization
- Maintains conversation context

### Architecture Philosophy
- **Base Class Pattern:** Generic implementation that works for all tenants
- **Tenant Customization:** Override specific behaviors per tenant
- **Checkpoint-Driven:** Human-in-the-loop at critical points
- **State-Based:** All context in TypedDict state
- **Modular Nodes:** Single-responsibility nodes

---

## LangGraph v1.0 Key Concepts

### What's Different in v1.0

**v0.x (Old):**
- Used `StateGraph` class
- State was a simple dict
- Checkpoints were manual
- No built-in persistence

**v1.0 (New):**
- Uses `StateGraph` with typed state (`TypedDict`)
- Built-in checkpoint system (`MemorySaver`, `SqliteSaver`, etc.)
- `interrupt()` for human-in-the-loop
- Better state management
- Native support for multiple graphs

### Key Imports (v1.0)
```python
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver
from typing import TypedDict, Annotated, Literal
from langgraph.graph.message import add_messages
```

### Core Concepts

**1. Typed State (TypedDict):**
- Define state schema with types
- Use `Annotated` for reducers
- Type safety throughout

**2. Checkpoints:**
- Automatic state snapshots
- Resume from any point
- Built-in persistence

**3. Interrupts:**
- `interrupt()` pauses execution
- Wait for human input
- Resume with updated state

**4. Reducers:**
- Control how state updates merge
- `add_messages` for message lists
- Custom reducers for complex state

---

## State Schema Design

### Base State Schema

**File:** `application/ai_agent/state.py`

**Purpose:** Define conversation state structure

```python
from typing import TypedDict, Annotated, Literal, Optional
from langgraph.graph.message import add_messages
from datetime import datetime

class AgentState(TypedDict):
    """
    Base state schema for booking agent.
    
    All tenant-specific agents inherit from this.
    Uses TypedDict for type safety.
    """
    
    # Conversation Context
    conversation_id: str
    tenant_id: str
    customer_id: str
    customer_phone: str
    
    # Message History (with reducer)
    messages: Annotated[list[dict], add_messages]
    # The add_messages reducer appends new messages to the list
    
    # Current Intent
    intent: Optional[Literal[
        "BOOK",           # Customer wants to book
        "MODIFY",         # Modify existing booking
        "CANCEL",         # Cancel booking
        "FAQ",            # General question
        "ESCALATE",       # Need human help
        "GREETING",       # Just saying hi
        "UNKNOWN"         # Unclear intent
    ]]
    
    # Intent Confidence
    intent_confidence: Optional[float]
    
    # Booking Information Being Collected
    booking_data: dict  # Flexible dict for booking details
    # Contains: service_id, service_name, date, time, customer_notes, etc.
    
    # Availability Check Results
    available_slots: Optional[list[dict]]
    selected_slot: Optional[dict]
    
    # Human-in-the-Loop
    requires_approval: bool
    approval_requested: bool
    approval_status: Optional[Literal["pending", "approved", "rejected"]]
    approval_id: Optional[str]  # booking_approval.id
    
    # Agent Response
    agent_response: Optional[str]
    response_type: Optional[Literal["text", "template", "media"]]
    
    # Error Handling
    error: Optional[str]
    error_count: int
    
    # Flow Control
    next_action: Optional[str]  # Which node to go to next
    is_complete: bool           # Conversation finished
    
    # Context & Memory
    conversation_history_summary: Optional[str]  # For long conversations
    extracted_entities: dict  # Extracted info (dates, times, names)
    
    # Metadata
    created_at: str
    updated_at: str
```

### State Field Descriptions

**Conversation Context:**
- `conversation_id`: UUID of conversation record
- `tenant_id`: Which business this is for
- `customer_id`: Customer UUID
- `customer_phone`: E.164 formatted phone

**Message History:**
- `messages`: List of all messages (uses `add_messages` reducer)
- Format: `[{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]`

**Intent Classification:**
- `intent`: Current user intent (enum)
- `intent_confidence`: Confidence score 0-1

**Booking Data:**
- `booking_data`: Flexible dict with collected info
- Example: `{"service_id": "uuid", "date": "2024-12-01", "time": "10:00", "notes": "..."}`

**HITL (Human-in-the-Loop):**
- `requires_approval`: Flag if needs human approval
- `approval_requested`: Already sent to human
- `approval_status`: Current approval state
- `approval_id`: Database record ID

**Flow Control:**
- `next_action`: Routing decision
- `is_complete`: End conversation flag

---

### State Reducers

**Default Reducer:** Replace value
```python
state["intent"] = "BOOK"  # Replaces previous value
```

**Add Messages Reducer:** Append to list
```python
# Uses Annotated[list[dict], add_messages]
# New messages automatically appended
state["messages"] = [{"role": "user", "content": "New message"}]
# Result: Previous messages + new message
```

**Custom Reducer Example:**
```python
from typing import Annotated

def merge_booking_data(existing: dict, new: dict) -> dict:
    """Merge new booking data with existing."""
    return {**existing, **new}

booking_data: Annotated[dict, merge_booking_data]
```

---

## Base Agent Architecture

### Class Structure

**File:** `application/ai_agent/base_agent.py`

```
BaseBookingAgent (Abstract Base Class)
├── __init__(tenant_id, config)
├── build_graph() → StateGraph
├── Node Methods:
│   ├── intent_classifier_node(state) → state
│   ├── booking_handler_node(state) → state
│   ├── availability_checker_node(state) → state
│   ├── approval_requester_node(state) → state
│   ├── faq_handler_node(state) → state
│   ├── escalation_node(state) → state
│   └── response_generator_node(state) → state
├── Edge Methods:
│   ├── route_by_intent(state) → str
│   ├── should_request_approval(state) → str
│   └── is_booking_complete(state) → str
├── Helper Methods:
│   ├── get_tenant_config() → dict
│   ├── get_services() → list
│   ├── check_availability(date, time) → list
│   ├── create_booking_approval(booking_data) → str
│   └── generate_response(template, context) → str
└── Customization Hooks:
    ├── customize_intent_prompt() → str
    ├── customize_faq_knowledge() → str
    └── customize_booking_flow() → None
```

---

### Graph Structure (State Machine)

```
                    START
                      │
                      ▼
              ┌───────────────┐
              │   Classify    │
              │    Intent     │
              └───────┬───────┘
                      │
        ┌─────────────┼─────────────┬──────────┐
        │             │             │          │
        ▼             ▼             ▼          ▼
    ┌───────┐   ┌──────────┐  ┌─────────┐  ┌─────────┐
    │  FAQ  │   │ Booking  │  │ Modify  │  │ Cancel  │
    │Handler│   │ Handler  │  │ Booking │  │ Booking │
    └───┬───┘   └────┬─────┘  └────┬────┘  └────┬────┘
        │            │              │            │
        │            ▼              │            │
        │      ┌──────────┐         │            │
        │      │  Check   │         │            │
        │      │Available │         │            │
        │      └────┬─────┘         │            │
        │           │               │            │
        │           ▼               │            │
        │    ┌─────────────┐        │            │
        │    │   Request   │        │            │
        │    │  Approval   │        │            │
        │    │  (HITL)     │        │            │
        │    └─────┬───────┘        │            │
        │          │                │            │
        │    [INTERRUPT]            │            │
        │          │                │            │
        │          ▼                │            │
        │    ┌──────────┐           │            │
        │    │  Wait    │           │            │
        │    │Approval  │           │            │
        │    └────┬─────┘           │            │
        │         │                 │            │
        └─────────┴─────────────────┴────────────┘
                      │
                      ▼
              ┌───────────────┐
              │   Generate    │
              │   Response    │
              └───────┬───────┘
                      │
                      ▼
                     END
```

---

### BaseBookingAgent Class

**File:** `application/ai_agent/base_agent.py`

**Purpose:** Generic booking agent for all tenants

#### Class Definition

```python
class BaseBookingAgent:
    """
    Base booking agent with standard conversation flow.
    
    Tenants can inherit and override specific behaviors.
    Uses LangGraph v1.0 with checkpoints.
    """
```

#### Attributes

- `tenant_id`: str - Tenant UUID
- `config`: dict - Agent configuration
- `graph`: StateGraph - Compiled LangGraph
- `checkpointer`: PostgresSaver - Checkpoint storage
- `llm_client`: ClaudeAPIClient - LLM for intent/response
- `booking_repo`: BookingRepository - Data access
- `service_repo`: ServiceRepository - Data access
- `conversation_repo`: ConversationRepository - Data access

#### Methods

**`__init__(tenant_id, config)`**
- Description: Initialize agent for tenant
- Parameters:
  - tenant_id: Tenant UUID
  - config: Configuration dict (optional overrides)
- Sets up: Repositories, LLM client, checkpointer
- Calls: `build_graph()`

**`build_graph() -> StateGraph`**
- Description: Construct the state machine
- Returns: Compiled StateGraph
- Steps:
  1. Create StateGraph with AgentState schema
  2. Add all nodes
  3. Add edges (routing logic)
  4. Set entry point (START → classify_intent)
  5. Compile with checkpointer
- Allows: Subclass override for custom graphs

**`compile() -> CompiledGraph`**
- Description: Compile graph for execution
- Returns: Runnable graph
- Uses: Checkpointer for persistence

**`invoke(state, config) -> state`**
- Description: Execute graph with input
- Parameters:
  - state: Initial state dict
  - config: Runtime config (thread_id for checkpointing)
- Returns: Final state
- Handles: Interrupts, checkpoints, errors

**`resume(checkpoint_id, updates) -> state`**
- Description: Resume from checkpoint
- Parameters:
  - checkpoint_id: Checkpoint to resume from
  - updates: State updates (e.g., approval_status)
- Returns: Updated state
- Use case: After human approval

---

## Node Implementations

### Node 1: Intent Classifier

**Method:** `intent_classifier_node(state: AgentState) -> AgentState`

**Purpose:** Classify user's intent using LLM

**Input State:**
- `messages`: Message history
- `conversation_history_summary`: Previous context (optional)

**Logic:**
1. Extract last user message
2. Build classification prompt:
   - System: "You are an intent classifier for a booking system..."
   - Context: Conversation history, tenant services
   - Task: "Classify intent as: BOOK, MODIFY, CANCEL, FAQ, ESCALATE, GREETING, UNKNOWN"
3. Call Claude API
4. Parse intent from response
5. Extract confidence score

**Output State Updates:**
- `intent`: Classified intent
- `intent_confidence`: Confidence score (0-1)
- `extracted_entities`: Any entities found (dates, times, service names)

**Customization Hook:** `customize_intent_prompt()`
- Tenants can override prompt
- Add tenant-specific examples
- Adjust tone/language

**Example Prompt:**
```
System: Eres un clasificador de intenciones para un sistema de reservas.

Contexto:
- El negocio ofrece: Terapia individual (60 min), Terapia de pareja (90 min)
- El cliente ya tiene 2 citas pasadas
- Última cita fue hace 1 mes

Mensaje del cliente: "Hola, necesito una cita para la próxima semana"

Clasifica la intención como una de:
- BOOK: Quiere hacer una nueva reserva
- MODIFY: Quiere cambiar una reserva existente
- CANCEL: Quiere cancelar una reserva
- FAQ: Tiene una pregunta general
- ESCALATE: Necesita hablar con una persona
- GREETING: Solo está saludando
- UNKNOWN: No está claro

Responde en JSON:
{
  "intent": "BOOK",
  "confidence": 0.95,
  "entities": {
    "timeframe": "próxima semana"
  },
  "reasoning": "Cliente solicita explícitamente una cita"
}
```

**Error Handling:**
- If LLM fails: Set intent = "UNKNOWN", confidence = 0
- If confidence < 0.6: Consider ESCALATE
- Retry logic: 3 attempts with exponential backoff

---

### Node 2: Booking Handler

**Method:** `booking_handler_node(state: AgentState) -> AgentState`

**Purpose:** Handle booking creation flow

**Triggers When:** `intent == "BOOK"`

**Sub-Flow:**
1. Check what booking info is collected
2. Identify missing required fields
3. Ask for missing info (generate prompt)
4. Extract entities from user response
5. Store in `booking_data`
6. Repeat until complete

**Required Fields:**
- `service_id` or `service_name`
- `date`
- `time` or `time_preference`

**Logic:**

**Step 1: Check Collected Data**
```python
booking_data = state.get("booking_data", {})
required = ["service_id", "date", "time"]
missing = [f for f in required if f not in booking_data]
```

**Step 2: If Missing Fields**
```python
if missing:
    # Generate question for next missing field
    question = generate_question_for_field(missing[0])
    state["agent_response"] = question
    state["next_action"] = "wait_for_user_input"
    return state
```

**Step 3: If All Fields Present**
```python
state["next_action"] = "check_availability"
return state
```

**Entity Extraction:**
- Date: "mañana", "próxima semana", "15 de diciembre"
- Time: "10am", "en la tarde", "después de almuerzo"
- Service: Match by name similarity

**Customization Hook:** `customize_booking_flow()`
- Add custom required fields
- Change question templates
- Adjust entity extraction

---

### Node 3: Availability Checker

**Method:** `availability_checker_node(state: AgentState) -> AgentState`

**Purpose:** Check Cal.com availability

**Triggers When:** Booking data complete

**Logic:**

**Step 1: Parse Booking Data**
```python
service_id = state["booking_data"]["service_id"]
date = state["booking_data"]["date"]
time = state["booking_data"].get("time")  # May be preference
```

**Step 2: Get Service Config**
```python
service = service_repo.get_by_id(service_id)
calcom_event_type_id = service.calcom_event_type_id
```

**Step 3: Query Cal.com**
```python
# Get availability for date
slots = calcom_client.get_availability(
    event_type_id=calcom_event_type_id,
    date_from=date,
    date_to=date
)
```

**Step 4: Filter Slots**
```python
if time:
    # Exact time requested
    matching = [s for s in slots if s["time"] == time]
else:
    # Show all available slots
    matching = slots
```

**Step 5: Update State**
```python
if matching:
    state["available_slots"] = matching
    state["next_action"] = "present_slots"
else:
    state["agent_response"] = "No hay disponibilidad para esa fecha/hora"
    state["next_action"] = "suggest_alternatives"
```

**Output State Updates:**
- `available_slots`: List of time slots
- `next_action`: Routing decision

**Error Handling:**
- Cal.com API error: Fallback to generic slots
- No availability: Suggest alternative dates
- Invalid date: Ask for clarification

---

### Node 4: Approval Requester

**Method:** `approval_requester_node(state: AgentState) -> AgentState`

**Purpose:** Request human approval (HITL checkpoint)

**Triggers When:** Booking ready to submit

**Logic:**

**Step 1: Create Booking Approval Record**
```python
approval = booking_repo.create_approval(
    tenant_id=state["tenant_id"],
    customer_id=state["customer_id"],
    requested_action="create",
    ai_suggested_data=state["booking_data"]
)
state["approval_id"] = approval.id
```

**Step 2: Set HITL Flags**
```python
state["requires_approval"] = True
state["approval_requested"] = True
state["approval_status"] = "pending"
```

**Step 3: Notify Business Owner**
```python
# Send notification (email, push, dashboard alert)
notify_owner(
    tenant_id=state["tenant_id"],
    message="Nueva reserva requiere aprobación",
    approval_id=approval.id
)
```

**Step 4: Generate Customer Message**
```python
state["agent_response"] = (
    "Perfecto! He enviado tu solicitud de reserva. "
    "Te confirmaré en unos minutos cuando sea aprobada."
)
```

**Step 5: INTERRUPT**
```python
# This pauses execution
from langgraph.types import interrupt

interrupt("waiting_for_approval")
```

**Step 6: Save State & Wait**
- Graph automatically saves checkpoint
- Execution pauses here
- Waits for external resume

**Output State Updates:**
- `approval_id`: Database record ID
- `approval_requested`: True
- `approval_status`: "pending"
- `agent_response`: Message to customer

**Checkpoint Format:**
```python
{
    "checkpoint_id": "uuid",
    "thread_id": conversation_id,
    "state": {entire_state_dict},
    "pending_writes": [],
    "interrupted_at": "approval_requester_node"
}
```

---

### Node 5: Approval Handler (Resume)

**Method:** `approval_handler_node(state: AgentState) -> AgentState`

**Purpose:** Handle approval result after resume

**Triggers When:** Graph resumed after approval

**Logic:**

**Step 1: Check Approval Status**
```python
approval_status = state.get("approval_status")
```

**Step 2: If Approved**
```python
if approval_status == "approved":
    # Create booking in Cal.com
    booking = calcom_client.create_booking(
        event_type_id=service.calcom_event_type_id,
        start_time=state["selected_slot"]["start"],
        customer_email=customer.email,
        customer_name=customer.full_name,
        customer_phone=customer.phone
    )
    
    # Create booking record
    booking_record = booking_repo.create(
        tenant_id=state["tenant_id"],
        customer_id=state["customer_id"],
        service_id=state["booking_data"]["service_id"],
        start_time=booking["start"],
        end_time=booking["end"],
        status="confirmed",
        calcom_booking_uid=booking["uid"]
    )
    
    # Generate confirmation
    state["agent_response"] = generate_confirmation_message(booking_record)
    state["is_complete"] = True
```

**Step 3: If Rejected**
```python
elif approval_status == "rejected":
    rejection_reason = state.get("rejection_reason", "no disponible")
    state["agent_response"] = (
        f"Lo siento, no pudimos confirmar tu reserva porque {rejection_reason}. "
        f"¿Te gustaría intentar con otra fecha?"
    )
    state["booking_data"] = {}  # Reset
    state["next_action"] = "restart_booking"
```

**Output State Updates:**
- `booking_id`: Created booking UUID (if approved)
- `agent_response`: Confirmation or rejection message
- `is_complete`: True if confirmed, False if rejected

---

### Node 6: FAQ Handler

**Method:** `faq_handler_node(state: AgentState) -> AgentState`

**Purpose:** Answer common questions

**Triggers When:** `intent == "FAQ"`

**Logic:**

**Step 1: Extract Question**
```python
last_message = state["messages"][-1]["content"]
```

**Step 2: Build FAQ Context**
```python
faq_knowledge = {
    "services": [list of services with descriptions],
    "pricing": price_info,
    "location": address,
    "hours": business_hours,
    "policies": cancellation_policy,
    "payment": payment_methods
}
```

**Step 3: Generate Answer**
```python
prompt = f"""
Contexto del negocio:
{json.dumps(faq_knowledge, indent=2)}

Pregunta del cliente: {last_message}

Responde de manera amigable y completa en español.
Si no sabes la respuesta, sugiere contactar directamente.
"""

answer = claude_client.generate_response(prompt)
```

**Step 4: Update State**
```python
state["agent_response"] = answer
state["is_complete"] = False  # May have follow-up
state["next_action"] = "wait_for_user_input"
```

**Customization Hook:** `customize_faq_knowledge()`
- Add tenant-specific FAQs
- Custom answer templates
- Link to external resources

**Common FAQ Topics:**
- Services offered
- Pricing and payment
- Location and hours
- Cancellation policy
- How to book
- Preparation for appointment

---

### Node 7: Escalation Handler

**Method:** `escalation_node(state: AgentState) -> AgentState`

**Purpose:** Handoff to human

**Triggers When:** `intent == "ESCALATE"` or confidence too low

**Logic:**

**Step 1: Notify Owner**
```python
notify_owner(
    tenant_id=state["tenant_id"],
    message="Cliente necesita atención humana",
    conversation_id=state["conversation_id"],
    priority="high"
)
```

**Step 2: Flag Conversation**
```python
conversation_repo.update(
    id=state["conversation_id"],
    status="escalated",
    requires_human=True
)
```

**Step 3: Inform Customer**
```python
state["agent_response"] = (
    "Te voy a conectar con una persona que te puede ayudar mejor. "
    "Te responderemos pronto por este mismo chat."
)
```

**Step 4: End Agent Flow**
```python
state["is_complete"] = True
state["next_action"] = "human_takeover"
```

**Output State Updates:**
- `agent_response`: Handoff message
- `is_complete`: True
- `next_action`: "human_takeover"

---

### Node 8: Response Generator

**Method:** `response_generator_node(state: AgentState) -> AgentState`

**Purpose:** Format final response for delivery

**Triggers When:** Any node sets `agent_response`

**Logic:**

**Step 1: Get Response**
```python
response = state.get("agent_response", "")
```

**Step 2: Apply Formatting**
```python
# Add emoji if appropriate
# Format lists with line breaks
# Add business signature
formatted = format_whatsapp_message(response)
```

**Step 3: Determine Response Type**
```python
response_type = "text"  # or "template", "media"
```

**Step 4: Add Follow-up Prompts (Optional)**
```python
if not state["is_complete"]:
    formatted += "\n\n¿En qué más te puedo ayudar?"
```

**Step 5: Update State**
```python
state["agent_response"] = formatted
state["response_type"] = response_type
```

**Output State Updates:**
- `agent_response`: Formatted message
- `response_type`: Message type

**Formatting Rules:**
- Keep messages conversational
- Use emoji sparingly (✅, 📅, ⏰)
- Break long text into paragraphs
- Use WhatsApp formatting (*bold*, _italic_)

---

## Edge Logic & Routing

### Edge Functions

**Purpose:** Determine next node based on state

**Pattern:**
```python
def route_function(state: AgentState) -> str:
    """Return next node name."""
    return "node_name"
```

---

### Edge 1: Route by Intent

**Function:** `route_by_intent(state: AgentState) -> str`

**Purpose:** Route after intent classification

**Logic:**
```python
intent = state.get("intent")
confidence = state.get("intent_confidence", 0)

if confidence < 0.6:
    return "escalation_node"

routes = {
    "BOOK": "booking_handler_node",
    "MODIFY": "modify_handler_node",
    "CANCEL": "cancel_handler_node",
    "FAQ": "faq_handler_node",
    "ESCALATE": "escalation_node",
    "GREETING": "greeting_node",
    "UNKNOWN": "clarification_node"
}

return routes.get(intent, "escalation_node")
```

**Routing Table:**
```
BOOK → booking_handler_node
MODIFY → modify_handler_node
CANCEL → cancel_handler_node
FAQ → faq_handler_node
ESCALATE → escalation_node
GREETING → greeting_node
UNKNOWN → escalation_node (if confidence low)
```

---

### Edge 2: Should Request Approval

**Function:** `should_request_approval(state: AgentState) -> str`

**Purpose:** Decide if booking needs approval

**Logic:**
```python
# Check if booking data is complete
booking_data = state.get("booking_data", {})
required_fields = ["service_id", "date", "time"]

if not all(f in booking_data for f in required_fields):
    return "booking_handler_node"  # Still collecting info

# Check if slot is selected
if not state.get("selected_slot"):
    return "availability_checker_node"

# All ready - request approval
return "approval_requester_node"
```

**Decision Points:**
- Missing booking data → Continue collecting
- No slot selected → Check availability
- Everything ready → Request approval

---

### Edge 3: Is Booking Complete

**Function:** `is_booking_complete(state: AgentState) -> str`

**Purpose:** Check if conversation should end

**Logic:**
```python
if state.get("is_complete"):
    return END

if state.get("error"):
    return "error_handler_node"

return "response_generator_node"
```

---

### Edge 4: Need More Info

**Function:** `need_more_info(state: AgentState) -> str`

**Purpose:** Determine if need to ask customer more questions

**Logic:**
```python
booking_data = state.get("booking_data", {})
required = ["service_id", "date", "time"]

missing = [f for f in required if f not in booking_data]

if missing:
    return "booking_handler_node"  # Ask for next field
else:
    return "availability_checker_node"  # Check availability
```

---

### Graph Edges Configuration

```python
def build_graph(self):
    graph = StateGraph(AgentState)
    
    # Add nodes
    graph.add_node("classify_intent", self.intent_classifier_node)
    graph.add_node("booking_handler", self.booking_handler_node)
    graph.add_node("availability_checker", self.availability_checker_node)
    graph.add_node("approval_requester", self.approval_requester_node)
    graph.add_node("approval_handler", self.approval_handler_node)
    graph.add_node("faq_handler", self.faq_handler_node)
    graph.add_node("escalation", self.escalation_node)
    graph.add_node("response_generator", self.response_generator_node)
    
    # Set entry point
    graph.set_entry_point("classify_intent")
    
    # Add conditional edges (routing)
    graph.add_conditional_edges(
        "classify_intent",
        self.route_by_intent,
        {
            "booking_handler": "booking_handler",
            "faq_handler": "faq_handler",
            "escalation": "escalation",
            # ... other routes
        }
    )
    
    graph.add_conditional_edges(
        "booking_handler",
        self.need_more_info,
        {
            "booking_handler": "booking_handler",  # Loop for more info
            "availability_checker": "availability_checker"
        }
    )
    
    graph.add_edge("availability_checker", "approval_requester")
    graph.add_edge("approval_requester", END)  # Interrupt here
    
    # After resume
    graph.add_edge("approval_handler", "response_generator")
    
    graph.add_conditional_edges(
        "response_generator",
        self.is_booking_complete,
        {
            END: END,
            "response_generator": "response_generator"
        }
    )
    
    # Compile with checkpointer
    return graph.compile(checkpointer=self.checkpointer)
```

---

## Human-in-the-Loop (Checkpoints)

### Checkpoint Strategy

**When to Create Checkpoints:**
1. **Before requesting approval** - Main HITL point
2. **After each user message** - Allow recovery
3. **Before external API calls** - Resume on failure
4. **On errors** - Debug and recover

### Checkpoint Workflow

**Step 1: Agent Reaches HITL Point**
```python
def approval_requester_node(state):
    # Create approval record
    approval_id = create_approval(state["booking_data"])
    
    state["approval_id"] = approval_id
    state["approval_requested"] = True
    
    # This creates a checkpoint and pauses execution
    interrupt("waiting_for_approval")
    
    return state
```

**Step 2: State Persisted**
- LangGraph automatically saves state to checkpointer
- Includes: Full state dict, node position, metadata

**Step 3: External Process (Owner Approval)**
- Owner sees approval request in dashboard
- Owner clicks "Approve" or "Reject"
- Backend updates approval record
- Backend prepares to resume graph

**Step 4: Resume Execution**
```python
def resume_after_approval(conversation_id, approval_status, rejection_reason=None):
    # Load checkpoint
    checkpoint = load_checkpoint(conversation_id)
    
    # Update state with approval result
    updates = {
        "approval_status": approval_status,  # "approved" or "rejected"
        "rejection_reason": rejection_reason
    }
    
    # Resume graph execution
    result = graph.invoke(
        updates,
        config={
            "thread_id": conversation_id,
            "checkpoint_id": checkpoint["id"]
        }
    )
    
    return result
```

**Step 5: Graph Continues**
- Execution resumes from checkpoint
- Goes to `approval_handler_node`
- Processes approval result
- Completes booking or restarts

---

### Checkpoint Storage

**LangGraph v1.0 Checkpoint Storage Options:**

**1. PostgresSaver (Production)**
```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver.from_conn_string(
    conn_string=DATABASE_URL
)
```

**Database Schema:**
```sql
CREATE TABLE checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (thread_id, checkpoint_id)
);
```

**2. MemorySaver (Development)**
```python
from langgraph.checkpoint.memory import MemorySaver

checkpointer = MemorySaver()
```

**Checkpoint Format:**
```python
{
    "thread_id": "conversation_uuid",
    "checkpoint_id": "checkpoint_uuid",
    "state": {
        "conversation_id": "...",
        "intent": "BOOK",
        "booking_data": {...},
        "approval_requested": True,
        # ... full state
    },
    "metadata": {
        "step": "approval_requester_node",
        "timestamp": "2024-11-29T10:30:00Z"
    },
    "pending_writes": []
}
```

---

### Resume Patterns

**Pattern 1: Simple Resume**
```python
# Just update state and continue
graph.invoke(
    {"approval_status": "approved"},
    config={"thread_id": conversation_id}
)
```

**Pattern 2: Resume with New Message**
```python
# Customer sent another message while waiting
graph.invoke(
    {
        "messages": [{"role": "user", "content": "Ya pagué!"}],
        "approval_status": "approved"
    },
    config={"thread_id": conversation_id}
)
```

**Pattern 3: Resume from Specific Checkpoint**
```python
# Resume from specific checkpoint (not just latest)
graph.invoke(
    {"approval_status": "approved"},
    config={
        "thread_id": conversation_id,
        "checkpoint_id": "specific_checkpoint_uuid"
    }
)
```

---

## Tenant Customization Strategy

### Customization Levels

**Level 1: Configuration (No Code)**
- Override config values
- Change prompts
- Add FAQ knowledge
- Adjust thresholds

**Level 2: Hook Methods (Light Code)**
- Override specific methods
- Custom prompt generation
- Custom entity extraction
- Custom validation

**Level 3: Custom Nodes (Full Code)**
- Add new nodes
- Modify graph structure
- Complex custom logic

---

### Level 1: Configuration Customization

**File:** `tenant_configs/[tenant_id].json`

**Example:**
```json
{
  "agent_name": "María Asistente",
  "language": "es",
  "tone": "amigable y profesional",
  
  "intent_examples": [
    {
      "text": "necesito una cita",
      "intent": "BOOK"
    },
    {
      "text": "cuánto cuesta la terapia",
      "intent": "FAQ"
    }
  ],
  
  "faq_knowledge": {
    "services": [
      {
        "name": "Terapia Individual",
        "description": "Sesión de 60 minutos...",
        "price": 50000
      }
    ],
    "location": "Calle 85 #15-20, Bogotá",
    "hours": "Lunes a Viernes 9am-7pm",
    "cancellation_policy": "24 horas de anticipación"
  },
  
  "required_booking_fields": ["service_id", "date", "time", "customer_notes"],
  
  "thresholds": {
    "intent_confidence_min": 0.6,
    "escalate_after_errors": 3
  },
  
  "response_templates": {
    "greeting": "Hola! Soy {agent_name}, ¿en qué puedo ayudarte?",
    "booking_confirmed": "✅ Confirmado! Tu cita es el {date} a las {time}",
    "approval_pending": "Perfecto! Estoy confirmando tu cita..."
  }
}
```

**Usage:**
```python
class CustomTenantAgent(BaseBookingAgent):
    def __init__(self, tenant_id):
        config = load_tenant_config(tenant_id)
        super().__init__(tenant_id, config)
```

---

### Level 2: Hook Method Customization

**Example: Custom Intent Prompt**

**File:** `application/ai_agent/custom_agents/maria_terapeuta_agent.py`

```python
class MariaTerapeutaAgent(BaseBookingAgent):
    """
    Custom agent for María Terapeuta.
    Specializes in mental health therapy bookings.
    """
    
    def customize_intent_prompt(self, message: str, context: dict) -> str:
        """
        Override: Add mental health specific examples.
        """
        base_prompt = super().customize_intent_prompt(message, context)
        
        additional_context = """
        
        Contexto adicional para terapia:
        - Si mencionan ansiedad, depresión, estrés → probablemente BOOK
        - Si preguntan por cobertura de EPS → FAQ
        - Si necesitan hablar de emergencia → ESCALATE
        
        Ejemplos específicos:
        - "me siento muy ansioso últimamente" → BOOK
        - "mi EPS cubre esto?" → FAQ
        - "estoy en crisis necesito ayuda ya" → ESCALATE
        """
        
        return base_prompt + additional_context
    
    def customize_faq_knowledge(self) -> dict:
        """
        Override: Add therapy-specific FAQs.
        """
        base_faq = super().customize_faq_knowledge()
        
        therapy_faq = {
            "insurance": "Trabajamos con las principales EPS...",
            "confidentiality": "Todas las sesiones son confidenciales...",
            "emergency": "Si es una emergencia, llama a la línea 123..."
        }
        
        return {**base_faq, **therapy_faq}
    
    def extract_booking_entities(self, message: str) -> dict:
        """
        Override: Extract therapy-specific entities.
        """
        entities = super().extract_booking_entities(message)
        
        # Detect therapy type from message
        if "pareja" in message.lower():
            entities["service_hint"] = "terapia_pareja"
        elif "grupo" in message.lower():
            entities["service_hint"] = "terapia_grupo"
        else:
            entities["service_hint"] = "terapia_individual"
        
        # Detect urgency
        urgency_keywords = ["urgente", "crisis", "emergencia", "hoy"]
        if any(kw in message.lower() for kw in urgency_keywords):
            entities["urgency"] = "high"
        
        return entities
```

**Example: Custom Validation**

```python
class FitnessTrainerAgent(BaseBookingAgent):
    """
    Custom agent for fitness trainer.
    Requires fitness level and goals.
    """
    
    def customize_booking_flow(self, state: AgentState) -> AgentState:
        """
        Override: Add fitness-specific questions.
        """
        booking_data = state.get("booking_data", {})
        
        # Custom required fields
        custom_required = ["fitness_level", "goals"]
        
        for field in custom_required:
            if field not in booking_data:
                question = self.get_question_for_field(field)
                state["agent_response"] = question
                state["next_action"] = "wait_for_user_input"
                return state
        
        # Validate fitness level
        fitness_level = booking_data.get("fitness_level", "").lower()
        if fitness_level not in ["principiante", "intermedio", "avanzado"]:
            state["agent_response"] = (
                "Por favor indica tu nivel de fitness: "
                "principiante, intermedio, o avanzado"
            )
            return state
        
        # Continue with standard flow
        return super().customize_booking_flow(state)
    
    def get_question_for_field(self, field: str) -> str:
        """Custom questions for fitness fields."""
        questions = {
            "fitness_level": "¿Cuál es tu nivel de fitness? (principiante/intermedio/avanzado)",
            "goals": "¿Cuáles son tus objetivos? (perder peso, ganar músculo, mejorar resistencia, etc.)"
        }
        return questions.get(field, f"Por favor proporciona: {field}")
```

---

### Level 3: Custom Node Implementation

**Example: Add New Node**

```python
class BeautyStudioAgent(BaseBookingAgent):
    """
    Custom agent for beauty studio.
    Adds service recommendation node.
    """
    
    def build_graph(self):
        """Override to add custom nodes."""
        graph = StateGraph(AgentState)
        
        # Standard nodes
        graph.add_node("classify_intent", self.intent_classifier_node)
        graph.add_node("booking_handler", self.booking_handler_node)
        
        # CUSTOM NODE
        graph.add_node("service_recommender", self.service_recommender_node)
        
        graph.add_node("availability_checker", self.availability_checker_node)
        graph.add_node("approval_requester", self.approval_requester_node)
        
        # Modified routing: Add recommender after intent
        graph.set_entry_point("classify_intent")
        
        graph.add_conditional_edges(
            "classify_intent",
            self.route_by_intent_with_recommendation,
            {
                "service_recommender": "service_recommender",  # NEW ROUTE
                "booking_handler": "booking_handler",
                "faq_handler": "faq_handler",
            }
        )
        
        graph.add_edge("service_recommender", "booking_handler")
        
        # Rest of edges...
        
        return graph.compile(checkpointer=self.checkpointer)
    
    def service_recommender_node(self, state: AgentState) -> AgentState:
        """
        NEW NODE: Recommend services based on customer preferences.
        """
        last_message = state["messages"][-1]["content"]
        
        # Analyze customer needs
        prompt = f"""
        Mensaje del cliente: {last_message}
        
        Servicios disponibles:
        - Corte de cabello ($30.000)
        - Coloración ($80.000)
        - Manicure ($25.000)
        - Pedicure ($30.000)
        - Tratamiento facial ($60.000)
        
        Recomienda los 2 servicios más relevantes basado en su mensaje.
        """
        
        recommendations = self.llm_client.generate_response(prompt)
        
        state["agent_response"] = (
            f"Basado en lo que me cuentas, te recomendaría:\n\n"
            f"{recommendations}\n\n"
            f"¿Cuál te gustaría reservar?"
        )
        
        return state
    
    def route_by_intent_with_recommendation(self, state: AgentState) -> str:
        """Modified routing to include recommender."""
        intent = state.get("intent")
        
        if intent == "BOOK":
            # Check if they mentioned a specific service
            last_message = state["messages"][-1]["content"]
            if not any(service in last_message.lower() 
                      for service in ["corte", "color", "manicure", "pedicure"]):
                # No specific service mentioned → recommend
                return "service_recommender"
        
        # Standard routing
        return super().route_by_intent(state)
```

---

### Customization Registry

**File:** `application/ai_agent/agent_factory.py`

**Purpose:** Create appropriate agent for tenant

```python
class AgentFactory:
    """
    Factory to create tenant-specific agents.
    """
    
    # Registry of custom agents
    CUSTOM_AGENTS = {
        "maria-terapeuta": MariaTerapeutaAgent,
        "fitness-pro": FitnessTrainerAgent,
        "beauty-studio": BeautyStudioAgent,
        # Add more custom agents here
    }
    
    @classmethod
    def create_agent(cls, tenant_id: str) -> BaseBookingAgent:
        """
        Create appropriate agent for tenant.
        
        Checks if tenant has custom agent, otherwise uses base.
        """
        tenant = tenant_repo.get_by_id(tenant_id)
        tenant_slug = tenant.slug
        
        # Check for custom agent
        if tenant_slug in cls.CUSTOM_AGENTS:
            agent_class = cls.CUSTOM_AGENTS[tenant_slug]
            return agent_class(tenant_id)
        
        # Use base agent with config
        config = load_tenant_config(tenant_id)
        return BaseBookingAgent(tenant_id, config)
```

**Usage:**
```python
# In WhatsApp webhook handler
agent = AgentFactory.create_agent(tenant_id)
result = agent.invoke(initial_state)
```

---

## State Persistence

### PostgreSQL Checkpoint Storage

**Table Schema:**
```sql
CREATE TABLE langgraph_checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    checkpoint JSONB NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (thread_id, checkpoint_id),
    FOREIGN KEY (thread_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_checkpoints_thread ON langgraph_checkpoints(thread_id);
CREATE INDEX idx_checkpoints_created ON langgraph_checkpoints(created_at);
```

**Integration with Conversation Table:**
```sql
-- Store current checkpoint ID in conversation
ALTER TABLE conversations 
ADD COLUMN langraph_checkpoint_id TEXT;

-- Update on each checkpoint
UPDATE conversations 
SET langraph_checkpoint_id = 'latest_checkpoint_id'
WHERE id = 'conversation_id';
```

---

### Checkpoint Lifecycle

**1. Create Checkpoint (Automatic)**
```python
# Happens automatically at:
# - End of each node
# - Before interrupt()
# - On error (if configured)

# Manual checkpoint (optional)
from langgraph.checkpoint import checkpoint

@checkpoint
def my_node(state):
    # State automatically saved after this node
    return state
```

**2. Load Checkpoint**
```python
# Load latest checkpoint for conversation
checkpoint = checkpointer.get(thread_id=conversation_id)

# Load specific checkpoint
checkpoint = checkpointer.get(
    thread_id=conversation_id,
    checkpoint_id=specific_checkpoint_id
)
```

**3. List Checkpoints**
```python
# Get all checkpoints for conversation (history)
checkpoints = checkpointer.list(thread_id=conversation_id)

for cp in checkpoints:
    print(f"Checkpoint {cp['checkpoint_id']} at {cp['metadata']['step']}")
```

**4. Delete Old Checkpoints**
```python
# Cleanup old checkpoints (retention policy)
# Keep last 10 checkpoints per conversation
def cleanup_old_checkpoints(conversation_id):
    checkpoints = checkpointer.list(thread_id=conversation_id)
    
    if len(checkpoints) > 10:
        old_checkpoints = checkpoints[10:]
        for cp in old_checkpoints:
            checkpointer.delete(
                thread_id=conversation_id,
                checkpoint_id=cp['checkpoint_id']
            )
```

---

## Error Handling & Recovery

### Error Strategies

**1. Retry with Exponential Backoff**
```python
def call_llm_with_retry(prompt, max_retries=3):
    for attempt in range(max_retries):
        try:
            return claude_client.generate_response(prompt)
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            wait_time = 2 ** attempt  # 1s, 2s, 4s
            time.sleep(wait_time)
```

**2. Fallback Responses**
```python
def intent_classifier_node(state):
    try:
        intent = classify_with_llm(state["messages"])
    except Exception as e:
        logger.error(f"Intent classification failed: {e}")
        # Fallback to keyword matching
        intent = classify_with_keywords(state["messages"][-1])
    
    state["intent"] = intent
    return state
```

**3. Graceful Degradation**
```python
def availability_checker_node(state):
    try:
        slots = calcom_client.get_availability(...)
    except CalComAPIError as e:
        logger.error(f"Cal.com API failed: {e}")
        # Fallback to manual approval
        state["agent_response"] = (
            "Déjame revisar la disponibilidad y te confirmo en unos minutos."
        )
        state["requires_approval"] = True
        return state
```

**4. Error Recovery Node**
```python
def error_recovery_node(state):
    """Handle errors and decide recovery strategy."""
    error = state.get("error")
    error_count = state.get("error_count", 0) + 1
    
    state["error_count"] = error_count
    
    if error_count >= 3:
        # Too many errors → escalate
        state["agent_response"] = (
            "Disculpa, estoy teniendo problemas técnicos. "
            "Te voy a conectar con una persona."
        )
        state["next_action"] = "escalation"
    else:
        # Try to recover
        state["agent_response"] = (
            "Disculpa, hubo un error. ¿Puedes intentar de nuevo?"
        )
        state["next_action"] = "retry"
    
    return state
```

---

### Error Types & Handling

**LLM Errors:**
- Rate limit → Wait and retry
- API error → Retry with backoff
- Timeout → Shorter prompt, retry
- Invalid response → Parse with fallback

**External API Errors:**
- Cal.com down → Manual approval fallback
- Network error → Retry, then escalate
- Invalid response → Log, escalate

**State Errors:**
- Missing required field → Ask for it again
- Invalid format → Validation message
- Corrupted state → Load from checkpoint

**System Errors:**
- Database error → Retry, log
- Out of memory → Simplify state
- Checkpoint error → Continue without checkpoint (warn)

---

## Implementation Specifications

### File Structure

```
application/ai_agent/
├── __init__.py
├── state.py                      # AgentState schema
├── base_agent.py                 # BaseBookingAgent class
├── agent_factory.py              # AgentFactory
├── nodes/                        # Node implementations
│   ├── __init__.py
│   ├── intent_classifier.py
│   ├── booking_handler.py
│   ├── availability_checker.py
│   ├── approval_requester.py
│   ├── faq_handler.py
│   ├── escalation.py
│   └── response_generator.py
├── edges/                        # Edge functions
│   ├── __init__.py
│   ├── routing.py
│   └── conditions.py
├── custom_agents/                # Tenant-specific agents
│   ├── __init__.py
│   ├── maria_terapeuta_agent.py
│   ├── fitness_trainer_agent.py
│   └── beauty_studio_agent.py
└── utils/                        # Helper utilities
    ├── __init__.py
    ├── entity_extraction.py
    ├── prompt_templates.py
    └── formatting.py
```

---

### Integration with WhatsApp Flow

**Step 1: Receive Message**
```python
# In HandleWhatsAppWebhookUseCase
def execute(payload):
    message_data = extract_message(payload)
    tenant = find_tenant_by_phone_number_id(payload["phone_number_id"])
    conversation = get_or_create_conversation(tenant, message_data["from"])
    
    # Process with agent
    process_with_agent(conversation, message_data)
```

**Step 2: Initialize Agent**
```python
def process_with_agent(conversation, message_data):
    # Create agent for tenant
    agent = AgentFactory.create_agent(conversation.tenant_id)
    
    # Build initial state
    state = {
        "conversation_id": str(conversation.id),
        "tenant_id": str(conversation.tenant_id),
        "customer_id": str(conversation.customer_id),
        "customer_phone": conversation.customer_phone,
        "messages": [
            {"role": "user", "content": message_data["text"]}
        ],
        "booking_data": {},
        "is_complete": False,
        "error_count": 0
    }
    
    # Load existing checkpoint if resuming
    if conversation.langraph_checkpoint_id:
        # Resume from checkpoint
        result = agent.resume(
            checkpoint_id=conversation.langraph_checkpoint_id,
            updates={"messages": state["messages"]}
        )
    else:
        # New conversation
        result = agent.invoke(
            state,
            config={"thread_id": str(conversation.id)}
        )
```

**Step 3: Send Response**
```python
    # Extract response from result
    agent_response = result["agent_response"]
    
    # Send via WhatsApp
    send_whatsapp_message(
        tenant_id=conversation.tenant_id,
        to=conversation.customer_phone,
        message=agent_response
    )
    
    # Save updated state
    conversation.langraph_state = result
    conversation.langraph_checkpoint_id = result.get("checkpoint_id")
    conversation.save()
```

**Step 4: Handle Interrupt (Approval)**
```python
# If agent hit interrupt (HITL)
if result.get("approval_requested"):
    # Agent paused, waiting for approval
    # Owner will approve via dashboard
    # When approved, resume:
    
    # In ApproveBookingUseCase
    agent = AgentFactory.create_agent(booking.tenant_id)
    conversation = get_conversation_for_booking(booking)
    
    result = agent.resume(
        checkpoint_id=conversation.langraph_checkpoint_id,
        updates={
            "approval_status": "approved",
            "approval_id": str(booking_approval.id)
        }
    )
    
    # Send confirmation to customer
    send_whatsapp_message(
        tenant_id=booking.tenant_id,
        to=conversation.customer_phone,
        message=result["agent_response"]
    )
```

---

### Testing Strategy

**Unit Tests:**
```python
def test_intent_classification():
    agent = BaseBookingAgent(tenant_id)
    
    state = {
        "messages": [{"role": "user", "content": "necesito una cita"}],
        # ... other required fields
    }
    
    result = agent.intent_classifier_node(state)
    
    assert result["intent"] == "BOOK"
    assert result["intent_confidence"] > 0.7
```

**Integration Tests:**
```python
def test_full_booking_flow():
    agent = BaseBookingAgent(tenant_id)
    
    # Simulate conversation
    messages = [
        "Hola, necesito una cita",
        "Terapia individual",
        "Mañana a las 10am",
    ]
    
    state = initial_state
    
    for msg in messages:
        state["messages"].append({"role": "user", "content": msg})
        state = agent.invoke(state)
    
    assert state["approval_requested"] == True
    assert "service_id" in state["booking_data"]
```

**Checkpoint Tests:**
```python
def test_resume_from_checkpoint():
    agent = BaseBookingAgent(tenant_id)
    
    # Start conversation
    state = agent.invoke(initial_state)
    
    # Get checkpoint
    checkpoint_id = state["checkpoint_id"]
    
    # Resume with approval
    result = agent.resume(
        checkpoint_id=checkpoint_id,
        updates={"approval_status": "approved"}
    )
    
    assert result["is_complete"] == True
    assert "booking_id" in result
```

---

## Summary

This LangGraph v1.0 design provides:

✅ **Base Agent Architecture** - Generic implementation for all tenants  
✅ **Typed State Schema** - Full AgentState with TypedDict  
✅ **8 Core Nodes** - Intent, booking, availability, approval, FAQ, escalation, response  
✅ **Conditional Routing** - Smart edge functions  
✅ **Human-in-the-Loop** - Checkpoint-based approval workflow  
✅ **3-Level Customization** - Config, hooks, custom nodes  
✅ **Error Handling** - Retry, fallback, recovery strategies  
✅ **State Persistence** - PostgreSQL checkpoint storage  
✅ **Production Ready** - Complete implementation specs  

### Key Features:

- **LangGraph v1.0 Native** - Uses new TypedDict state, interrupt(), built-in checkpoints
- **Modular Design** - Each node is single-purpose, easy to test
- **Tenant Flexibility** - Base class works for all, customize as needed
- **HITL Built-in** - Approval checkpoints with resume capability
- **Conversation Context** - Full message history, entity tracking
- **Error Resilient** - Multiple fallback strategies

### Implementation Timeline:

**Week 1-2:** Base agent + core nodes  
**Week 3:** HITL checkpoint system  
**Week 4:** Tenant customization framework  
**Week 5:** Testing + refinement  

**Total: 5 weeks** for production-ready AI agent

---

**Document Version:** 1.0  
**Last Updated:** November 29, 2024  
**LangGraph Version:** 1.0  
**Status:** Ready for Implementation  
**Estimated Timeline:** 5 weeks (1 developer)
