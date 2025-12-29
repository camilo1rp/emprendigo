from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from backend.core.database import get_db
from backend.api.v1.schemas.customer_schemas import CustomerCreate, CustomerResponse
from backend.infrastructure.repositories.customer_repository import CustomerRepository
from backend.application.customer.use_cases import (
    CreateOrUpdateCustomerUseCase,
    GetCustomersQuery
)
from backend.api.v1.routers.auth import get_current_user
from backend.infrastructure.persistence.models import AuthUser

router = APIRouter()

@router.get("/", response_model=List[CustomerResponse])
async def get_customers(
    skip: int = 0,
    limit: int = 100,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    customer_repo = CustomerRepository(db)
    query = GetCustomersQuery(customer_repo)
    return await query.execute(current_user.tenant_id, skip, limit)

@router.post("/", response_model=CustomerResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_customer(
    data: CustomerCreate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    customer_repo = CustomerRepository(db)
    use_case = CreateOrUpdateCustomerUseCase(customer_repo)
    return await use_case.execute(current_user.tenant_id, data)
