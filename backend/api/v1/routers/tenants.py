from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from backend.api.v1.schemas.tenant_schemas import TenantUpdate, TenantResponse
from backend.api.v1.schemas.auth_schemas import Token
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.application.tenant.use_cases import UpdateTenantUseCase, GetTenantBySlugQuery
from backend.api.v1.routers.auth import get_current_user
from backend.infrastructure.persistence.models import AuthUser

router = APIRouter()

@router.get("/by-slug/{slug}", response_model=TenantResponse)
async def get_tenant_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    tenant_repo = TenantRepository(db)
    query = GetTenantBySlugQuery(tenant_repo)
    return await query.execute(slug)

@router.get("/me", response_model=TenantResponse)
async def get_me(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_repo = TenantRepository(db)
    return await tenant_repo.get_by_id(current_user.tenant_id)

@router.patch("/me", response_model=TenantResponse)
async def update_me(
    data: TenantUpdate,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    tenant_repo = TenantRepository(db)
    use_case = UpdateTenantUseCase(tenant_repo)
    return await use_case.execute(current_user.tenant_id, data)

@router.post("/calcom-connection", response_model=TenantResponse)
async def connect_calcom(
    data: dict, # Using dict or create a specific schema
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # In a real app we'd inject this via dependency injection
    from backend.infrastructure.external.cal_com_api import CalComAPIClient
    from backend.application.tenant.connect_calcom import ConnectCalComUseCase
    
    # Simple dependency handling for now
    client = CalComAPIClient()
    try:
        tenant_repo = TenantRepository(db)
        use_case = ConnectCalComUseCase(tenant_repo, client)
        
        # Expecting api_key and username in body
        api_key = data.get("api_key")
        username = data.get("username")
        
        if not api_key or not username:
            raise HTTPException(status_code=400, detail="Missing api_key or username")
            
        return await use_case.execute(current_user.tenant_id, api_key, username)
    finally:
        await client.close()

@router.post("/whatsapp-connection", response_model=bool) # Return simple success
async def connect_whatsapp(
    data: dict, 
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from backend.infrastructure.external.meta_cloud_api import MetaCloudAPIClient
    from backend.application.tenant.connect_whatsapp import ConnectWhatsAppUseCase

    # Validate inputs
    phone_number = data.get("phone_number")
    phone_number_id = data.get("phone_number_id")
    access_token = data.get("access_token")
    waba_id = data.get("waba_id")
    
    if not all([phone_number, phone_number_id, access_token, waba_id]):
        raise HTTPException(status_code=400, detail="Missing required fields")

    client = MetaCloudAPIClient()
    try:
        tenant_repo = TenantRepository(db)
        use_case = ConnectWhatsAppUseCase(tenant_repo, client)
        return await use_case.execute(current_user.tenant_id, phone_number, phone_number_id, access_token, waba_id)
    finally:
        await client.close()
