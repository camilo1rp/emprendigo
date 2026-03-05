import pytest
from httpx import AsyncClient

TENANT_DATA = {
    "slug": "test-tenant-customers",
    "business_name": "Test Business Customers",
    "email": "customer_test@example.com",
    "password": "password123"
}

@pytest.mark.asyncio
async def test_customers_api(client: AsyncClient):
    # 1. Register Tenant/Owner
    res = await client.post("/api/v1/auth/register", json=TENANT_DATA)
    assert res.status_code == 201
    auth_data = res.json()
    access_token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 2. Get Customers (Empty)
    res = await client.get("/api/v1/customers/", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) == 0

    # 3. Create Customer
    customer_data = {
        "first_name": "Maria",
        "last_name": "Gomez",
        "phone": "+573009876543",
        "email": "maria@example.com"
    }
    res = await client.post("/api/v1/customers/", json=customer_data, headers=headers)
    assert res.status_code == 201
    customer_json = res.json()
    assert customer_json["first_name"] == "Maria"
    assert customer_json["phone"] == "+573009876543"

    # 4. Get Customers (Contains 1)
    res = await client.get("/api/v1/customers/", headers=headers)
    assert res.status_code == 200
    customers = res.json()
    assert len(customers) == 1
    assert customers[0]["id"] == customer_json["id"]
