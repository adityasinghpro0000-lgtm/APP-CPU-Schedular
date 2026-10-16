"""
Workload generation routes.
"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse

from schemas.workload import WorkloadResponse, Process
from utils.workload_generator import generate_workload

router = APIRouter()

router = APIRouter()


@router.get("/", response_model=WorkloadResponse)
async def generate_workload_endpoint(
    count: int = Query(default=5, ge=1, le=20),
    distribution: str = Query(default="uniform", pattern="^(uniform|poisson|exponential)$"),
    lambda_param: float = Query(default=2.0, gt=0),
    max_burst: int = Query(default=8, gt=0)
):
    """Generate synthetic CPU scheduling workload."""
    processes = generate_workload(count, distribution, lambda_param, max_burst)
    return WorkloadResponse(processes=processes)