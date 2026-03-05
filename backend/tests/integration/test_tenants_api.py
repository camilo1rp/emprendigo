import pytest
from httpx import AsyncClient

TENANT_DATA = {
    "slug": "test-tenant-api",
    "business_name": "Test Target Tenant",
    "email": "tenant_test@example.com",
    "password": "password123"
}

@pytest.mark.asyncio
async def test_tenants_api(client: AsyncClient):
    # 1. Register Tenant/Owner
    res = await client.post("/api/v1/auth/register", json=TENANT_DATA)
    assert res.status_code == 201
    auth_data = res.json()
    access_token = auth_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    # 2. Get Me
    res = await client.get("/api/v1/tenants/me", headers=headers)
    assert res.status_code == 200
    tenant_resp = res.json()
    assert tenant_resp["slug"] == "test-tenant-api"
    assert tenant_resp["business_name"] == "Test Target Tenant"
    assert tenant_resp["nequi_number"] is None

    # 3. Update Me (Set Nequi number)
    update_data = {
        "nequi_number": "3001112233"
    }
    res = await client.patch("/api/v1/tenants/me", json=update_data, headers=headers)
    assert res.status_code == 200
    tenant_updated = res.json()
    assert tenant_updated["nequi_number"] == "3001112233"

    # 4. Verify getting Me returns updated data
    res = await client.get("/api/v1/tenants/me", headers=headers)
    assert res.status_code == 200
    tenant_resp = res.json()
    assert tenant_resp["nequi_number"] == "3001112233"
