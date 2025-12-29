from uuid import UUID
from typing import List
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.api.v1.schemas.customer_schemas import CustomerCreate, CustomerUpdate
from backend.infrastructure.persistence.models import Customer
from fastapi import HTTPException, status
from datetime import datetime

class CreateOrUpdateCustomerUseCase:
    def __init__(self, customer_repo: CustomerRepository):
        self.customer_repo = customer_repo

    async def execute(self, tenant_id: UUID, data: CustomerCreate) -> Customer:
        existing_customer = await self.customer_repo.get_by_phone(tenant_id, data.phone)
        
        if existing_customer:
            # Update existing
            update_data = data.model_dump(exclude_unset=True)
            if data.whatsapp_optin and not existing_customer.whatsapp_optin:
                update_data["whatsapp_optin_date"] = datetime.utcnow()
            return await self.customer_repo.update(existing_customer, update_data)
        else:
            # Create new
            customer_data = data.model_dump()
            customer_data["tenant_id"] = tenant_id
            if data.whatsapp_optin:
                customer_data["whatsapp_optin_date"] = datetime.utcnow()
            return await self.customer_repo.create(customer_data)

class GetCustomersQuery:
    def __init__(self, customer_repo: CustomerRepository):
        self.customer_repo = customer_repo

    async def execute(self, tenant_id: UUID, skip: int = 0, limit: int = 100) -> List[Customer]:
        return await self.customer_repo.get_by_tenant(tenant_id, skip, limit)
