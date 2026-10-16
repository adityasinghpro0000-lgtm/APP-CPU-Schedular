"""
Simulation result models for storing past simulations.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text
from sqlalchemy.orm import relationship

from database.session import Base


class SimulationResult(Base):
    """Simulation result model for storing past runs."""
    __tablename__ = "simulation_results"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    algorithm = Column(String(50), nullable=False)
    algorithm_full_name = Column(String(100), nullable=False)
    metrics = Column(JSON, nullable=True)  # avgWT, avgTAT, avgRT, utilization, throughput, makespan
    created_at = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace")
    processes = relationship("SimulationProcess", back_populates="simulation", cascade="all, delete-orphan")
    gantt_data = relationship("SimulationGantt", back_populates="simulation", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        """Convert simulation result to dictionary."""
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "algorithm": self.algorithm,
            "algorithm_full_name": self.algorithm_full_name,
            "metrics": self.metrics,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "processes": [p.to_dict() for p in self.processes],
            "gantt": [g.to_dict() for g in self.gantt_data],
        }


class SimulationProcess(Base):
    """Simulation process result model."""
    __tablename__ = "simulation_processes"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    pid = Column(String(50), nullable=False)
    arrival = Column(Integer, nullable=False)
    burst = Column(Integer, nullable=False)
    priority = Column(Integer, default=1)
    deadline = Column(Integer, nullable=True)
    completion_time = Column(Integer, nullable=True)
    turnaround_time = Column(Integer, nullable=True)
    waiting_time = Column(Integer, nullable=True)
    response_time = Column(Integer, nullable=True)
    state = Column(String(50), default="Terminated")
    color = Column(String(20), default="#506db0")

    simulation = relationship("SimulationResult", back_populates="processes")

    def to_dict(self) -> dict:
        """Convert simulation process to dictionary."""
        return {
            "id": self.id,
            "simulation_id": self.simulation_id,
            "pid": self.pid,
            "arrival": self.arrival,
            "burst": self.burst,
            "priority": self.priority,
            "deadline": self.deadline,
            "completion_time": self.completion_time,
            "turnaround_time": self.turnaround_time,
            "waiting_time": self.waiting_time,
            "response_time": self.response_time,
            "state": self.state,
            "color": self.color,
        }


class SimulationGantt(Base):
    """Simulation Gantt chart segment model."""
    __tablename__ = "simulation_gantt"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulation_results.id", ondelete="CASCADE"), nullable=False)
    block_id = Column(String(50), nullable=False)  # PID, 'CS', 'IDLE'
    block_type = Column(String(20), nullable=False)  # 'cpu', 'cs', 'idle'
    start_time = Column(Integer, nullable=False)
    end_time = Column(Integer, nullable=False)

    simulation = relationship("SimulationResult", back_populates="gantt_data")

    def to_dict(self) -> dict:
        """Convert Gantt segment to dictionary."""
        return {
            "id": self.id,
            "simulation_id": self.simulation_id,
            "block_id": self.block_id,
            "block_type": self.block_type,
            "start_time": self.start_time,
            "end_time": self.end_time,
        }