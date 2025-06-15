"""
API Dependencies
"""

from typing import Generator, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session
from app.core import security
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.schemas.token import TokenPayload
import redis
from app.utils.cache import cache_client

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

optional_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login",
    auto_error=False
)


def get_db() -> Generator:
    """Get database session"""
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()


def get_redis() -> redis.Redis:
    """Get Redis client"""
    return cache_client.redis_client


def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    """Get current authenticated user"""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    user = db.query(User).filter(User.id == token_data.sub).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return user


def get_current_user_optional(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(optional_oauth2)
) -> Optional[User]:
    """Get current user if authenticated, None otherwise"""
    if not token:
        return None
    
    try:
        return get_current_user(db=db, token=token)
    except HTTPException:
        return None


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    return current_user


def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Get current active superuser"""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


def get_token_payload(token: str = Depends(reusable_oauth2)) -> TokenPayload:
    """Get token payload"""
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        return token_data
    except (JWTError, ValidationError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )


class RateLimitDep:
    """Rate limiting dependency"""
    
    def __init__(self, max_requests: int = 100, window: int = 60):
        self.max_requests = max_requests
        self.window = window
    
    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        redis_client: redis.Redis = Depends(get_redis)
    ):
        """Check rate limit for user"""
        if not settings.RATE_LIMIT_ENABLED:
            return
        
        key = f"rate_limit:{current_user.id}"
        try:
            current = redis_client.incr(key)
            if current == 1:
                redis_client.expire(key, self.window)
            
            if current > self.max_requests:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Max {self.max_requests} requests per {self.window} seconds"
                )
        except redis.RedisError:
            # Don't block requests if Redis is down
            pass


# Rate limit instances for different endpoints
rate_limit_default = RateLimitDep(
    max_requests=settings.RATE_LIMIT_REQUESTS,
    window=settings.RATE_LIMIT_PERIOD
)

rate_limit_strict = RateLimitDep(
    max_requests=10,
    window=60
)

rate_limit_ai = RateLimitDep(
    max_requests=20,
    window=60
)


class PermissionChecker:
    """Permission checker dependency"""
    
    def __init__(self, required_permissions: List[str]):
        self.required_permissions = required_permissions
    
    async def __call__(
        self,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        """Check if user has required permissions"""
        if current_user.is_superuser:
            return True
        
        # Get user permissions from database
        user_permissions = []  # This would be loaded from user.permissions
        
        for permission in self.required_permissions:
            if permission not in user_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required permission: {permission}"
                )
        
        return True


def verify_api_key(api_key: str = Depends(reusable_oauth2)) -> bool:
    """Verify API key for external integrations"""
    # This would check against stored API keys in database
    if not api_key.startswith("ak_"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key format"
        )
    
    # Verify API key in database
    # For now, just return True
    return True