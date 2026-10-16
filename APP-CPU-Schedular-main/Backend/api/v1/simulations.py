"""
Simulation result routes.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.session import get_db
from schemas.simulation import (
    SimulationResultCreate, SimulationResultResponse,
    SimulationProcessResponse, SimulationGanttResponse
)
from crud.simulation import (
    get_simulation, get_simulations, create_simulation,
    add_simulation_process, add_simulation_gantt_segment,
    update_simulation_metrics
)

router = APIRouter()


@router.get("/{simulation_id}", response_model=SimulationResultResponse)
async def read_simulation(
    simulation_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific simulation result by ID."""
    simulation = get_simulation(db, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return simulation


@router.get("/workspace/{workspace_id}", response_model=List[SimulationResultResponse])
async def read_workspace_simulations(
    workspace_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all simulation results for a workspace."""
    simulations = get_simulations(db, workspace_id=workspace_id, skip=skip, limit=limit)
    return simulations


@router.post("/", response_model=SimulationResultResponse, status_code=201)
async def create_simulation_endpoint(
    simulation: SimulationResultCreate,
    db: Session = Depends(get_db)
):
    """Create a new simulation result."""
    db_simulation = create_simulation(
        db,
        workspace_id=simulation.workspace_id,
        algorithm=simulation.algorithm,
        algorithm_full_name=simulation.algorithm_full_name
    )
    
    # Add processes
    for process_data in simulation.processes:
        add_simulation_process(db, db_simulation.id, process_data)
    
    # Add Gantt segments
    for segment_data in simulation.gantt:
        add_simulation_gantt_segment(db, db_simulation.id, segment_data)
    
    # Update metrics if provided
    if simulation.metrics:
        update_simulation_metrics(db, db_simulation.id, simulation.metrics)
    
    return db_simulation


@router.post("/{simulation_id}/metrics")
async def update_simulation_metrics_endpoint(
    simulation_id: int,
    metrics: dict,
    db: Session = Depends(get_db)
):
    """Update simulation metrics."""
    db_simulation = update_simulation_metrics(db, simulation_id, metrics)
    if db_simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return db_simulation


@router.get("/{simulation_id}/export/csv")
async def export_simulation_csv(
    simulation_id: int,
    db: Session = Depends(get_db)
):
    """Export simulation results to CSV."""
    simulation = get_simulation(db, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    # Create CSV content
    csv_content = "PID,Arrival,Burst,Priority,Deadline,CT,TAT,WT,RT\n"
    for process in simulation.processes:
        csv_content += f"{process.pid},{process.arrival},{process.burst},{process.priority},{process.deadline or ''},{process.completion_time or ''},{process.turnaround_time or ''},{process.waiting_time or ''},{process.response_time or ''}\n"
    
    # Return as file download
    from fastapi.responses import Response
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=simulation_results.csv"}
    )


@router.get("/{simulation_id}/export/json")
async def export_simulation_json(
    simulation_id: int,
    db: Session = Depends(get_db)
):
    """Export simulation results to JSON."""
    simulation = get_simulation(db, simulation_id)
    if simulation is None:
        raise HTTPException(status_code=404, detail="Simulation not found")
    
    return simulation.to_dict()