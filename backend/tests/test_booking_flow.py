import pytest
from httpx import AsyncClient
from uuid import uuid4

# Mock data
TENANT_DATA = {
    "slug": "test-integration-tenant",
    "business_name": "Test Tenant",
    "email": f"test-{uuid4()}@example.com",
    "password": "Password123!"
}

@pytest.mark.asyncio
async def test_booking_flow_integration(client: AsyncClient):
    # 1. Register Tenant/Owner
    res = await client.post("/api/v1/auth/register", json=TENANT_DATA)
    assert res.status_code == 201
    auth_data = res.json()
    access_token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # 2. Setup Service
    service_data = {
        "name": "Haircut Test",
        "duration_minutes": 30,
        "price_amount": 10000,
        "is_active": True
    }
    res = await client.post("/api/v1/services/", json=service_data, headers=headers)
    assert res.status_code == 201
    service_id = res.json()["id"]
    
    # 3. Create Customer
    customer_data = {
        "first_name": "Juan",
        "last_name": "Perez",
        "phone": "+573001234567",
        "email": "juan@example.com"
    }
    res = await client.post("/api/v1/customers/", json=customer_data, headers=headers)
    assert res.status_code == 201
    customer_id = res.json()["id"]
    
    # 4. Create Booking
    # Note: Requires correct date format
    booking_data = {
        "service_id": service_id,
        "customer_id": customer_id,
        "start_time": "2025-12-30T10:00:00Z",
        "end_time": "2025-12-30T10:30:00Z"
    }
    res = await client.post("/api/v1/bookings/", json=booking_data, headers=headers)
    assert res.status_code == 201
    booking = res.json()
    booking_id = booking["id"]
    assert booking["status"] == "PENDING_APPROVAL"
    assert booking["payment_status"] == "PENDING"
    
    # 5. Upload Payment Proof
    proof_data = {
        "transaction_id": "TX123456",
        "image_url": "http://example.com/proof.jpg"
    }
    res = await client.post(f"/api/v1/payments/{booking_id}/proof", json=proof_data, headers=headers)
    assert res.status_code == 200
    updated_booking = res.json()
    assert updated_booking["payment_status"] == "PENDING_VERIFICATION"
    
    # 6. Verify Payment (Admin)
    verify_data = {
        "verified": True
    }
    res = await client.post(f"/api/v1/payments/{booking_id}/verify", json=verify_data, headers=headers)
    assert res.status_code == 200
    final_booking = res.json()
    assert final_booking["payment_status"] == "PAID"
    # Note: Depending on logic, status might still be pending approval or approved.
