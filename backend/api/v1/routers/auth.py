from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from backend.core.security import get_password_hash, verify_password, create_access_token
from backend.infrastructure.repositories.tenant_repository import TenantRepository
from backend.infrastructure.repositories.auth_user_repository import AuthUserRepository
from backend.api.v1.schemas.auth_schemas import TenantCreate, Token, TenantResponse
from backend.infrastructure.persistence.models import AuthUser

router = APIRouter()

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(tenant_in: TenantCreate, db: AsyncSession = Depends(get_db)):
    tenant_repo = TenantRepository(db)
    user_repo = AuthUserRepository(db)
    
    # Check if tenant exists
    if await tenant_repo.get_by_email(tenant_in.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    
    if await tenant_repo.get_by_slug(tenant_in.slug):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug already taken",
        )
    
    # Create tenant
    tenant = await tenant_repo.create({
        "slug": tenant_in.slug,
        "business_name": tenant_in.business_name,
        "email": tenant_in.email,
        "status": "active"
    })
    
    # Create user
    user = await user_repo.create({
        "tenant_id": tenant.id,
        "email": tenant_in.email,
        "hashed_password": get_password_hash(tenant_in.password),
        "role": "owner",
        "is_active": True
    })
    
    # Create token
    access_token = create_access_token(subject=str(user.id))
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user_repo = AuthUserRepository(db)
    user = await user_repo.get_by_email(form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token = create_access_token(subject=str(user.id))
    return {"access_token": access_token, "token_type": "bearer"}
