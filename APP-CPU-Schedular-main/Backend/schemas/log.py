"""
Pydantic schemas for system log operations.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LogBase(BaseModel):
    """Base log schema."""
    message: str = Field(..., min_length=1, max_length=500)


class LogCreate(LogBase):
    """Schema for creating a new log."""
    profile_id: Optional[int] = None


class LogResponse(LogBase):
    """Schema for log response."""
    id: int
    timestamp: datetime
    profile_id: Optional[int] = None

    class Config:
        orm_mode = True