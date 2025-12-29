from uuid import UUID
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.infrastructure.external.meta_cloud_api import MetaCloudAPIClient
from fastapi import HTTPException, status

class ConnectWhatsAppUseCase:
    def __init__(self, tenant_repo: TenantRepository, meta_client: MetaCloudAPIClient):
        self.tenant_repo = tenant_repo
        self.meta_client = meta_client

    async def execute(self, tenant_id: UUID, phone_number: str, phone_number_id: str, access_token: str, waba_id: str) -> bool:
        # Validate Token
        is_valid = await self.meta_client.validate_token(access_token)
        if not is_valid:
             raise HTTPException(status_code=400, detail="Invalid WhatsApp Access Token")
             
        # Update Tenant
        tenant = await self.tenant_repo.get_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        data = {
            "whatsapp_phone_number": phone_number,
            "whatsapp_phone_number_id": phone_number_id,
            "whatsapp_access_token": access_token,
            "whatsapp_waba_id": waba_id,
            "whatsapp_webhook_verify_token": "emprendigo_verify_token" # Static for now or generated per tenant
        }
        
        await self.tenant_repo.update(tenant, data)
        return True
