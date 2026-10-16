"""
CRUD operations for simulation results.
"""

from typing import Optional, List
from sqlalchemy.orm import Session

from database.session import SessionLocal
from models.simulation import SimulationResult, SimulationProcess, SimulationGantt


def get_simulation(db: Session, simulation_id: int) -> Optional[SimulationResult]:
    """Get simulation result by ID."""
    return db.query(SimulationResult).filter(SimulationResult.id == simulation_id).first()


def get_simulations(db: Session, workspace_id: int, skip: int = 0, limit: int = 100) -> List[SimulationResult]:
    """Get all simulation results for a workspace."""
    return db.query(SimulationResult).filter(
        SimulationResult.workspace_id == workspace_id
    ).offset(skip).limit(limit).all()


def create_simulation(db: Session, workspace_id: int, algorithm: str, algorithm_full_name: str) -> SimulationResult:
    """Create a new simulation result."""
    db_simulation = SimulationResult(
        workspace_id=workspace_id,
        algorithm=algorithm,
        algorithm_full_name=algorithm_full_name
    )
    db.add(db_simulation)
    db.commit()
    db.refresh(db_simulation)
    return db_simulation


def add_simulation_process(db: Session, simulation_id: int, process_data: dict) -> SimulationProcess:
    """Add a process to a simulation result."""
    db_process = SimulationProcess(
        simulation_id=simulation_id,
        pid=process_data["pid"],
        arrival=process_data["arrival"],
        burst=process_data["burst"],
        priority=process_data.get("priority", 1),
        deadline=process_data.get("deadline"),
        completion_time=process_data.get("completion_time"),
        turnaround_time=process_data.get("turnaround_time"),
        waiting_time=process_data.get("waiting_time"),
        response_time=process_data.get("response_time"),
        state=process_data.get("state", "Terminated"),
        color=process_data.get("color", "#506db0")
    )
    db.add(db_process)
    db.commit()
    db.refresh(db_process)
    return db_process


def add_simulation_gantt_segment(db: Session, simulation_id: int, segment_data: dict) -> SimulationGantt:
    """Add a Gantt segment to a simulation result."""
    db_segment = SimulationGantt(
        simulation_id=simulation_id,
        block_id=segment_data["block_id"],
        block_type=segment_data["block_type"],
        start_time=segment_data["start_time"],
        end_time=segment_data["end_time"]
    )
    db.add(db_segment)
    db.commit()
    db.refresh(db_segment)
    return db_segment


def update_simulation_metrics(db: Session, simulation_id: int, metrics: dict) -> Optional[SimulationResult]:
    """Update simulation metrics."""
    db_simulation = get_simulation(db, simulation_id)
    if not db_simulation:
        return None
    
    db_simulation.metrics = metrics
    db.commit()
    db.refresh(db_simulation)
    return db_simulation