"""
Pydantic schemas for profile operations.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProfileBase(BaseModel):
    """Base profile schema."""
    name: str = Field(..., min_length=1, max_length=100)
    role: Optional[str] = Field(default="Project user", max_length=50)


class ProfileCreate(ProfileBase):
    """Schema for creating a new profile."""
    pass


class ProfileUpdate(BaseModel):
    """Schema for updating a profile."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    role: Optional[str] = Field(None, max_length=50)


class ProfileResponse(ProfileBase):
    """Schema for profile response."""
    id: int
    active: bool
    created_at: datetime
    updated_at: datetime
    avatar: Optional[str] = None

    class Config:
        orm_mode = True
