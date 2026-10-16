"""
Pydantic schemas for workload generation.
"""

from typing import List

from pydantic import BaseModel, Field


class Process(BaseModel):
    """Process model for workload generation."""
    id: str = Field(..., max_length=50)
    arrival: int = Field(..., ge=0)
    burst: int = Field(..., gt=0)
    priority: int = Field(..., gt=0)
    deadline: int = Field(..., gt=0)
    color: str = Field(..., max_length=20)
    state: str = Field(default="Ready", max_length=50)


class WorkloadResponse(BaseModel):
    """Response for workload generation."""
    processes: List[Process]


class WorkloadRequest(BaseModel):
    """Request for workload generation."""
    count: int = Field(default=5, ge=1, le=20)
    distribution: str = Field(default="uniform", pattern="^(uniform|poisson|exponential)$")
    lambda_param: float = Field(default=2.0, gt=0)
    max_burst: int = Field(default=8, gt=0)