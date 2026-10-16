"""
Pydantic schemas for workspace operations.
"""

from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, Field


class WorkspaceProcessBase(BaseModel):
    """Base workspace process schema."""
    pid: str = Field(..., max_length=50)
    arrival: int = Field(default=0, ge=0)
    burst: int = Field(..., gt=0)
    priority: int = Field(default=1, ge=1)
    deadline: Optional[int] = Field(default=None, gt=0)
    color: str = Field(default="#506db0", max_length=20)
    state: str = Field(default="Ready", max_length=50)


class WorkspaceJobBase(BaseModel):
    """Base workspace job schema."""
    job_id: str = Field(..., max_length=50)
    arrival: int = Field(default=0, ge=0)
    burst: int = Field(..., gt=0)
    priority: int = Field(default=1, ge=1)
    deadline: Optional[int] = Field(default=None, gt=0)


class WorkspaceBase(BaseModel):
    """Base workspace schema."""
    name: str = Field(default="Workspace 1", max_length=100)
    algorithm: str = Field(default="fcfs", max_length=50)
    quantum: int = Field(default=2, gt=0)
    context_switch: int = Field(default=0, ge=0)
    priority_convention: str = Field(default="lower", max_length=10)
    job_policy: str = Field(default="fcfs", max_length=50)
    job_admission_time: int = Field(default=0, ge=0)
    job_capacity: int = Field(default=5, gt=0)
    mlfq_quanta: List[int] = Field(default=[2, 4, 8])


class WorkspaceCreate(WorkspaceBase):
    """Schema for creating a new workspace."""
    processes: Optional[List[WorkspaceProcessBase]] = None
    jobs: Optional[List[WorkspaceJobBase]] = None


class WorkspaceUpdate(BaseModel):
    """Schema for updating a workspace."""
    name: Optional[str] = Field(None, max_length=100)
    algorithm: Optional[str] = Field(None, max_length=50)
    quantum: Optional[int] = Field(None, gt=0)
    context_switch: Optional[int] = Field(None, ge=0)
    priority_convention: Optional[str] = Field(None, max_length=10)
    job_policy: Optional[str] = Field(None, max_length=50)
    job_admission_time: Optional[int] = Field(None, ge=0)
    job_capacity: Optional[int] = Field(None, gt=0)
    mlfq_quanta: Optional[List[int]] = None


class WorkspaceResponse(WorkspaceBase):
    """Schema for workspace response."""
    id: int
    profile_id: int
    last_modified: datetime
    processes: List[WorkspaceProcessBase] = []
    jobs: List[WorkspaceJobBase] = []

    class Config:
        orm_mode = True