"""
Workspace management routes.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database.session import get_db
from schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse
from crud.workspace import (
    get_workspace, get_workspaces, create_workspace, update_workspace,
    delete_workspace, add_process_to_workspace, add_job_to_workspace,
    save_workspace_state
)

router = APIRouter()


@router.get("/", response_model=List[WorkspaceResponse])
async def read_workspaces(
    profile_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all workspaces for a profile."""
    workspaces = get_workspaces(db, profile_id=profile_id, skip=skip, limit=limit)
    return workspaces


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def read_workspace(
    workspace_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific workspace by ID."""
    workspace = get_workspace(db, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace


@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace_endpoint(
    profile_id: int,
    name: str = "Workspace 1",
    db: Session = Depends(get_db)
):
    """Create a new workspace."""
    workspace = create_workspace(db, profile_id=profile_id, name=name)
    return workspace


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace_endpoint(
    workspace_id: int,
    workspace: WorkspaceUpdate,
    db: Session = Depends(get_db)
):
    """Update a workspace."""
    db_workspace = update_workspace(db, workspace_id, **workspace.dict(exclude_unset=True))
    if db_workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return db_workspace


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace_endpoint(
    workspace_id: int,
    db: Session = Depends(get_db)
):
    """Delete a workspace."""
    if not delete_workspace(db, workspace_id):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return None


@router.post("/{workspace_id}/processes", response_model=WorkspaceResponse)
async def add_workspace_process(
    workspace_id: int,
    pid: str,
    arrival: int = 0,
    burst: int = 1,
    priority: int = 1,
    deadline: Optional[int] = None,
    color: str = "#506db0",
    state: str = "Ready",
    db: Session = Depends(get_db)
):
    """Add a process to a workspace."""
    db_workspace = get_workspace(db, workspace_id)
    if db_workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    process_data = {
        "pid": pid,
        "arrival": arrival,
        "burst": burst,
        "priority": priority,
        "deadline": deadline,
        "color": color,
        "state": state
    }
    
    process = add_process_to_workspace(db, workspace_id, process_data)
    if process is None:
        raise HTTPException(status_code=400, detail="Failed to add process")
    
    return db_workspace


@router.post("/{workspace_id}/jobs", response_model=WorkspaceResponse)
async def add_workspace_job(
    workspace_id: int,
    job_id: str,
    arrival: int = 0,
    burst: int = 1,
    priority: int = 1,
    deadline: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Add a job to a workspace."""
    db_workspace = get_workspace(db, workspace_id)
    if db_workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    job_data = {
        "job_id": job_id,
        "arrival": arrival,
        "burst": burst,
        "priority": priority,
        "deadline": deadline
    }
    
    job = add_job_to_workspace(db, workspace_id, job_data)
    if job is None:
        raise HTTPException(status_code=400, detail="Failed to add job")
    
    return db_workspace


@router.post("/{workspace_id}/save")
async def save_workspace(
    workspace_id: int,
    state: dict,
    db: Session = Depends(get_db)
):
    """Save the complete workspace state."""
    db_workspace = save_workspace_state(db, workspace_id, state)
    if db_workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    return {"success": True, "message": "Workspace saved successfully"}


@router.get("/{workspace_id}/export")
async def export_workspace(
    workspace_id: int,
    db: Session = Depends(get_db)
):
    """Export a workspace to JSON."""
    workspace = get_workspace(db, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    
    return JSONResponse(content=workspace.to_dict())