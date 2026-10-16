"""
Workspace models for storing simulation workloads.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship

from database.session import Base


class Workspace(Base):
    """Workspace model for storing user workloads."""
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), default="Workspace 1")
    algorithm = Column(String(50), default="fcfs")
    quantum = Column(Integer, default=2)
    context_switch = Column(Integer, default=0)
    priority_convention = Column(String(10), default="lower")
    job_policy = Column(String(50), default="fcfs")
    job_admission_time = Column(Integer, default=0)
    job_capacity = Column(Integer, default=5)
    mlfq_quanta = Column(JSON, default=[2, 4, 8])
    last_modified = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owner = relationship("Profile", back_populates="workspaces")
    processes = relationship("WorkspaceProcess", back_populates="workspace", cascade="all, delete-orphan")
    jobs = relationship("WorkspaceJob", back_populates="workspace", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        """Convert workspace to dictionary."""
        return {
            "id": self.id,
            "profile_id": self.profile_id,
            "name": self.name,
            "algorithm": self.algorithm,
            "quantum": self.quantum,
            "context_switch": self.context_switch,
            "priority_convention": self.priority_convention,
            "job_policy": self.job_policy,
            "job_admission_time": self.job_admission_time,
            "job_capacity": self.job_capacity,
            "mlfq_quanta": self.mlfq_quanta,
            "last_modified": self.last_modified.isoformat() if self.last_modified else None,
            "processes": [p.to_dict() for p in self.processes],
            "jobs": [j.to_dict() for j in self.jobs],
        }


class WorkspaceProcess(Base):
    """Workspace process model."""
    __tablename__ = "workspace_processes"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    pid = Column(String(50), nullable=False)
    arrival = Column(Integer, default=0)
    burst = Column(Integer, nullable=False)
    priority = Column(Integer, default=1)
    deadline = Column(Integer, nullable=True)
    color = Column(String(20), default="#506db0")
    state = Column(String(50), default="Ready")

    workspace = relationship("Workspace", back_populates="processes")

    def to_dict(self) -> dict:
        """Convert workspace process to dictionary."""
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "pid": self.pid,
            "arrival": self.arrival,
            "burst": self.burst,
            "priority": self.priority,
            "deadline": self.deadline,
            "color": self.color,
            "state": self.state,
        }


class WorkspaceJob(Base):
    """Workspace job model for long-term scheduling."""
    __tablename__ = "workspace_jobs"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    job_id = Column(String(50), nullable=False)
    arrival = Column(Integer, default=0)
    burst = Column(Integer, nullable=False)
    priority = Column(Integer, default=1)
    deadline = Column(Integer, nullable=True)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    admitted_at = Column(DateTime, nullable=True)

    workspace = relationship("Workspace", back_populates="jobs")

    def to_dict(self) -> dict:
        """Convert workspace job to dictionary."""
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "job_id": self.job_id,
            "arrival": self.arrival,
            "burst": self.burst,
            "priority": self.priority,
            "deadline": self.deadline,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "admitted_at": self.admitted_at.isoformat() if self.admitted_at else None,
        }