from uuid import UUID
from typing import List
from backend.infrastructure.repositories.service_repository import ServiceRepository
from backend.api.v1.schemas.service_schemas import ServiceCreate, ServiceUpdate
from backend.infrastructure.persistence.models import Service
from fastapi import HTTPException, status

class CreateServiceUseCase:
    def __init__(self, service_repo: ServiceRepository):
        self.service_repo = service_repo

    async def execute(self, tenant_id: UUID, data: ServiceCreate) -> Service:
        if await self.service_repo.name_exists(tenant_id, data.name):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Service name already exists")
        
        service_data = data.model_dump()
        service_data["tenant_id"] = tenant_id
        return await self.service_repo.create(service_data)

class UpdateServiceUseCase:
    def __init__(self, service_repo: ServiceRepository):
        self.service_repo = service_repo

    async def execute(self, service_id: UUID, data: ServiceUpdate) -> Service:
        service = await self.service_repo.get_by_id(service_id)
        if not service:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
        
        return await self.service_repo.update(service, data)

class DeleteServiceUseCase:
    def __init__(self, service_repo: ServiceRepository):
        self.service_repo = service_repo

    async def execute(self, service_id: UUID) -> bool:
        service = await self.service_repo.get_by_id(service_id)
        if not service:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found")
        
        # TODO: Check for active bookings before deleting
        return await self.service_repo.delete(service_id)

class GetServicesQuery:
    def __init__(self, service_repo: ServiceRepository):
        self.service_repo = service_repo

    async def execute(self, tenant_id: UUID, active_only: bool = False) -> List[Service]:
        return await self.service_repo.get_by_tenant(tenant_id, active_only)
