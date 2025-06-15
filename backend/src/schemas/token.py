"""
Token schemas
"""

from typing import Optional
from pydantic import BaseModel


class Token(BaseModel):
    """Token response"""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    """Token payload"""
    sub: Optional[str] = None
    exp: Optional[int] = None
    type: Optional[str] = None