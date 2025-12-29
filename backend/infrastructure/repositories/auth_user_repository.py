from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.infrastructure.repositories.base_repository import BaseRepository
from backend.infrastructure.persistence.models import AuthUser

class AuthUserRepository(BaseRepository[AuthUser]):
    def __init__(self, session: AsyncSession):
        super().__init__(AuthUser, session)

    async def get_by_email(self, email: str) -> AuthUser | None:
        query = select(AuthUser).where(AuthUser.email == email)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
