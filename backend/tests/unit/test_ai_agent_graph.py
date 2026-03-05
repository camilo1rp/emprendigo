import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from langchain_core.messages import HumanMessage, AIMessage
from backend.application.ai_agent.graph import intent_classifier_node, route_intent
from backend.application.ai_agent.state import AgentState

@pytest.mark.asyncio
async def test_route_intent_info():
    state: AgentState = {
        "messages": [HumanMessage(content="What are your hours?")],
        "tenant_id": "test_tenant",
        "customer_id": "test_customer",
        "tenant_config": {},
        "intent": {"category": "INFO_QUERY"},
        "booking_context": {}
    }
    next_node = route_intent(state)
    assert next_node == "info_node"

@pytest.mark.asyncio
async def test_route_intent_booking():
    state: AgentState = {
        "messages": [HumanMessage(content="I want to book a haircut")],
        "tenant_id": "test_tenant",
        "customer_id": "test_customer",
        "tenant_config": {},
        "intent": {"category": "BOOKING_INTENT"},
        "booking_context": {}
    }
    next_node = route_intent(state)
    assert next_node == "booking_node"

@pytest.mark.asyncio
async def test_route_intent_unknown():
    state: AgentState = {
        "messages": [HumanMessage(content="Hello")],
        "tenant_id": "test_tenant",
        "customer_id": "test_customer",
        "tenant_config": {},
        "intent": {"category": "UNKNOWN"},
        "booking_context": {}
    }
    next_node = route_intent(state)
    assert next_node == "info_node"

@pytest.mark.asyncio
@patch('backend.application.ai_agent.nodes.booking.get_services_list', new_callable=AsyncMock)
@patch('backend.application.ai_agent.nodes.booking.LLMFactory.create_llm')
@patch('backend.application.ai_agent.nodes.booking.ChatPromptTemplate.from_messages')
async def test_booking_node_parsing(mock_from_messages, mock_llm_factory, mock_get_services):
    from backend.application.ai_agent.nodes.booking import booking_node, BookingExtraction
    
    # Mocking services list
    mock_service = MagicMock()
    mock_service.name = "Haircut"
    mock_service.price_amount = 50000
    mock_get_services.return_value = [mock_service]
    
    mock_extraction = BookingExtraction(
        service_name="Haircut",
        datetime_slot="Tomorrow at 10 AM",
        notes=""
    )
    
    mock_chain = AsyncMock()
    mock_chain.ainvoke.return_value = mock_extraction
    
    mock_prompt = MagicMock()
    mock_prompt.__or__.return_value = mock_chain
    mock_from_messages.return_value = mock_prompt

    # Test initial state with full info
    state: AgentState = {
        "messages": [HumanMessage(content="I want to book a Haircut for tomorrow at 10 AM")],
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "customer_id": "11111111-1111-1111-1111-111111111111",
        "tenant_config": {},
        "intent": "booking",
        "booking_context": {}
    }

    result = await booking_node(state)
    
    context = result["booking_context"]
    assert context["service_name"] == "Haircut"
    assert context["datetime_slot"] == "Tomorrow at 10 AM"
    assert context["step"] == "CONFIRMATION"
    assert context["requires_payment"] is True
    
    # It sends a message out telling the user to confirm
    assert "confirm" in result["messages"][0].content.lower()

@pytest.mark.asyncio
@patch('backend.application.ai_agent.nodes.booking.get_services_list', new_callable=AsyncMock)
@patch('backend.application.ai_agent.nodes.booking.get_tenant_payment_config', new_callable=AsyncMock)
@patch('backend.application.ai_agent.nodes.booking.BookingRepository.create', new_callable=AsyncMock)
async def test_booking_node_confirmation(mock_create, mock_payment_config, mock_get_services):
    from backend.application.ai_agent.nodes.booking import booking_node
    
    # Mock services
    mock_service = MagicMock()
    mock_service.name = "Haircut"
    mock_service.id = "22222222-2222-2222-2222-222222222222"
    mock_get_services.return_value = [mock_service]
    
    # Mock Payment config
    mock_payment_config.return_value = ("3001234567", "3009876543")

    state: AgentState = {
        "messages": [HumanMessage(content="Yes, please")],
        "tenant_id": "00000000-0000-0000-0000-000000000000",
        "customer_id": "11111111-1111-1111-1111-111111111111",
        "tenant_config": {},
        "intent": "booking",
        "booking_context": {
            "step": "CONFIRMATION",
            "service_name": "Haircut",
            "datetime_slot": "Tomorrow at 10 AM",
            "requires_payment": True
        }
    }

    result = await booking_node(state)
    
    context = result["booking_context"]
    assert context["step"] == "COMPLETED"
    
    assert mock_create.called
    create_args = mock_create.call_args[0][0]
    assert create_args["status"] == "PENDING_PAYMENT"
    
    msg_content = result["messages"][0].content
    assert "3001234567" in msg_content
    assert "3009876543" in msg_content
