from uuid import UUID
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.api.v1.schemas.tenant_schemas import TenantUpdate
from backend.infrastructure.persistence.models import Tenant
from fastapi import HTTPException, status

class UpdateTenantUseCase:
    def __init__(self, tenant_repo: TenantRepository):
        self.tenant_repo = tenant_repo

    async def execute(self, tenant_id: UUID, data: TenantUpdate) -> Tenant:
        tenant = await self.tenant_repo.get_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        
        return await self.tenant_repo.update(tenant, data)

class GetTenantBySlugQuery:
    def __init__(self, tenant_repo: TenantRepository):
        self.tenant_repo = tenant_repo

    async def execute(self, slug: str) -> Tenant:
        tenant = await self.tenant_repo.get_by_slug(slug)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        return tenant
