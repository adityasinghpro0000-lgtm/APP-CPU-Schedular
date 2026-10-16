"""
Pydantic schemas for simulation results.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field


class SimulationProcessResponse(BaseModel):
    """Response schema for simulation process."""
    pid: str
    arrival: int
    burst: int
    priority: int
    deadline: Optional[int]
    completion_time: Optional[int]
    turnaround_time: Optional[int]
    waiting_time: Optional[int]
    response_time: Optional[int]
    state: str
    color: str


class SimulationGanttResponse(BaseModel):
    """Response schema for Gantt segment."""
    block_id: str
    block_type: str
    start_time: int
    end_time: int


class SimulationMetrics(BaseModel):
    """Simulation metrics schema."""
    avgWT: float
    avgTAT: float
    avgRT: float
    utilization: float
    throughput: float
    makespan: int


class SimulationResultResponse(BaseModel):
    """Response schema for simulation result."""
    id: int
    workspace_id: int
    algorithm: str
    algorithm_full_name: str
    metrics: Optional[Dict[str, Any]]
    created_at: datetime
    processes: List[SimulationProcessResponse]
    gantt: List[SimulationGanttResponse]


class SimulationResultCreate(BaseModel):
    """Schema for creating a new simulation result."""
    workspace_id: int
    algorithm: str
    algorithm_full_name: str
    metrics: Optional[Dict[str, Any]] = None
    processes: List[Dict[str, Any]]
    gantt: List[Dict[str, Any]]