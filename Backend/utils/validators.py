"""
Input validation utilities.
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.profile import Profile


def validate_profile_exists(db: Session, profile_id: int) -> Profile:
    """Validate that a profile exists."""
    profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


def validate_workspace_exists(db: Session, workspace_id: int) -> dict:
    """Validate that a workspace exists and return its info."""
    from ..models.workspace import Workspace
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"workspace": workspace, "profile_id": workspace.profile_id}


def validate_profile_ownership(db: Session, profile_id: int, profile_name: str) -> bool:
    """Validate that the profile belongs to the current user."""
    profile = db.query(Profile).filter(
        Profile.id == profile_id,
        Profile.name == profile_name
    ).first()
    return profile is not None


def validate_process_data(process_data: dict) -> dict:
    """Validate and normalize process data."""
    required_fields = ['pid', 'burst']
    
    for field in required_fields:
        if field not in process_data:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required field: {field}"
            )
    
    # Validate burst
    if process_data['burst'] < 1:
        raise HTTPException(status_code=400, detail="Burst time must be at least 1")
    
    # Validate arrival
    if process_data.get('arrival', 0) < 0:
        raise HTTPException(status_code=400, detail="Arrival time cannot be negative")
    
    return process_data


def validate_workload_params(count: int, distribution: str, lam: float, max_burst: int) -> dict:
    """Validate workload generation parameters."""
    if count < 1 or count > 20:
        raise HTTPException(status_code=400, detail="Count must be between 1 and 20")
    
    if distribution not in ['uniform', 'poisson', 'exponential']:
        raise HTTPException(
            status_code=400,
            detail="Distribution must be uniform, poisson, or exponential"
        )
    
    if lam <= 0:
        raise HTTPException(status_code=400, detail="Lambda must be positive")
    
    if max_burst < 1:
        raise HTTPException(status_code=400, detail="Max burst must be at least 1")
    
    return {
        'count': count,
        'distribution': distribution,
        'lambda': lam,
        'max_burst': max_burst
    }