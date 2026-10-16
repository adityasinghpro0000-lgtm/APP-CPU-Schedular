"""
CRUD operations for workspace management.
"""

from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from database.session import SessionLocal
from models.workspace import Workspace, WorkspaceProcess, WorkspaceJob


def get_workspace(db: Session, workspace_id: int) -> Optional[Workspace]:
    """Get workspace by ID."""
    return db.query(Workspace).filter(Workspace.id == workspace_id).first()


def get_workspaces(db: Session, profile_id: int, skip: int = 0, limit: int = 100) -> List[Workspace]:
    """Get all workspaces for a profile."""
    return db.query(Workspace).filter(
        Workspace.profile_id == profile_id
    ).offset(skip).limit(limit).all()


def create_workspace(db: Session, profile_id: int, name: str = "Workspace 1") -> Workspace:
    """Create a new workspace."""
    db_workspace = Workspace(
        profile_id=profile_id,
        name=name
    )
    db.add(db_workspace)
    db.commit()
    db.refresh(db_workspace)
    return db_workspace


def update_workspace(db: Session, workspace_id: int, **kwargs) -> Optional[Workspace]:
    """Update a workspace."""
    db_workspace = get_workspace(db, workspace_id)
    if not db_workspace:
        return None
    
    for key, value in kwargs.items():
        if hasattr(db_workspace, key) and value is not None:
            setattr(db_workspace, key, value)
    
    db.commit()
    db.refresh(db_workspace)
    return db_workspace


def delete_workspace(db: Session, workspace_id: int) -> bool:
    """Delete a workspace."""
    db_workspace = get_workspace(db, workspace_id)
    if not db_workspace:
        return False
    
    db.delete(db_workspace)
    db.commit()
    return True


def add_process_to_workspace(db: Session, workspace_id: int, process_data: dict) -> Optional[WorkspaceProcess]:
    """Add a process to a workspace."""
    db_workspace = get_workspace(db, workspace_id)
    if not db_workspace:
        return None
    
    db_process = WorkspaceProcess(
        workspace_id=workspace_id,
        pid=process_data["pid"],
        arrival=process_data.get("arrival", 0),
        burst=process_data["burst"],
        priority=process_data.get("priority", 1),
        deadline=process_data.get("deadline"),
        color=process_data.get("color", "#506db0"),
        state=process_data.get("state", "Ready")
    )
    
    db.add(db_process)
    db.commit()
    db.refresh(db_process)
    return db_process


def add_job_to_workspace(db: Session, workspace_id: int, job_data: dict) -> Optional[WorkspaceJob]:
    """Add a job to a workspace."""
    db_workspace = get_workspace(db, workspace_id)
    if not db_workspace:
        return None
    
    db_job = WorkspaceJob(
        workspace_id=workspace_id,
        job_id=job_data["job_id"],
        arrival=job_data.get("arrival", 0),
        burst=job_data["burst"],
        priority=job_data.get("priority", 1),
        deadline=job_data.get("deadline")
    )
    
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job


def save_workspace_state(db: Session, workspace_id: int, state: dict) -> Optional[Workspace]:
    """Save workspace settings, processes, and queued jobs."""
    db_workspace = get_workspace(db, workspace_id)
    if not db_workspace:
        return None
    aliases = {"context_switch": "cs", "priority_convention": "priConv", "job_policy": "jobPolicy", "job_admission_time": "jobAdmissionTime", "job_capacity": "jobCapacity"}
    for field in ["name", "algorithm", "quantum", "context_switch", "priority_convention", "job_policy", "job_admission_time", "job_capacity", "mlfq_quanta"]:
        source = field if field in state else aliases.get(field)
        if source and source in state:
            setattr(db_workspace, field, state[source])
    if "processes" in state:
        db.query(WorkspaceProcess).filter(WorkspaceProcess.workspace_id == workspace_id).delete()
        for item in state["processes"] or []:
            db.add(WorkspaceProcess(workspace_id=workspace_id,pid=str(item.get("pid",item.get("id",""))),arrival=item.get("arrival",0),burst=item.get("burst",1),priority=item.get("priority",1),deadline=item.get("deadline"),color=item.get("color","#506db0"),state=item.get("state","Ready")))
    if "jobs" in state:
        db.query(WorkspaceJob).filter(WorkspaceJob.workspace_id == workspace_id).delete()
        for item in state["jobs"] or []:
            db.add(WorkspaceJob(workspace_id=workspace_id,job_id=str(item.get("job_id",item.get("id",""))),arrival=item.get("arrival",0),burst=item.get("burst",1),priority=item.get("priority",1),deadline=item.get("deadline")))
    db.commit()
    db.refresh(db_workspace)
    return db_workspace
