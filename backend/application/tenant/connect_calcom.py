from uuid import UUID
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.infrastructure.external.cal_com_api import CalComAPIClient, CalComAPIError
from backend.api.v1.schemas.tenant_schemas import TenantUpdate
from backend.infrastructure.persistence.models import Tenant
from fastapi import HTTPException, status

class ConnectCalComUseCase:
    def __init__(self, tenant_repo: TenantRepository, cal_com_client: CalComAPIClient):
        self.tenant_repo = tenant_repo
        self.cal_com_client = cal_com_client

    async def execute(self, tenant_id: UUID, api_key: str, username: str) -> Tenant:
        # Validate API Key
        is_valid = await self.cal_com_client.validate_api_key(api_key)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Cal.com API Key"
            )
        
        # Update Tenant
        tenant = await self.tenant_repo.get_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")
        
        # Prepare update data
        update_data = TenantUpdate(
            brand_settings=None # We are not updating brand settings here
        )
        # We need to update specific columns not in TenantUpdate model directly or use a dict
        # TenantUpdate has brand_settings, etc. But calcom fields might not be in the 'standard' update schema exposed to frontend?
        # Actually TenantUpdate in schema usually has fields exposed to API.
        # Let's check TenantUpdate schema.
        
        # If TenantUpdate doesn't have calcom fields, we might need to update model directly or add them to schema.
        # Schema `TenantUpdate` has `brand_settings`.
        # I should probably update `TenantUpdate` schema to include calcom fields if `execute` takes them from a specialized request, 
        # OR just pass a dict to `tenant_repo.update`.
        
        # Let's inspect TenantUpdate schema again.
        
        # For now, I will assume I can update via dict or modify repo update method.
        # BaseRepository update takes `obj_in: Union[UpdateSchemaType, Dict[str, Any]]`.
        
        data = {
            "calcom_api_key": api_key,
            "calcom_username": username
        }
        
        return await self.tenant_repo.update(tenant, data)
