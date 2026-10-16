"""
System log management routes.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database.session import get_db
from schemas.log import LogCreate, LogResponse
from crud.log import get_logs, get_logs_by_profile, create_log, clear_logs

router = APIRouter()


@router.get("/", response_model=List[LogResponse])
async def read_logs(
    profile_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get system logs, optionally filtered by profile."""
    logs = get_logs(db, profile_id=profile_id, skip=skip, limit=limit)
    return logs


@router.post("/", response_model=LogResponse)
async def create_log_endpoint(
    log: LogCreate,
    db: Session = Depends(get_db)
):
    """Create a new system log."""
    db_log = create_log(db, message=log.message, profile_id=log.profile_id)
    return db_log


@router.delete("/", status_code=204)
async def clear_logs_endpoint(
    profile_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Clear system logs, optionally for a specific profile."""
    deleted_count = clear_logs(db, profile_id=profile_id)
    return {"deleted": deleted_count}


@router.get("/export")
async def export_logs(
    profile_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Export logs to CSV format."""
    logs = get_logs(db, profile_id=profile_id)
    
    # Create CSV content
    csv_content = "Time,Message,ProfileID\n"
    for log in logs:
        csv_content += f"{log.timestamp},{log.message},{log.profile_id or ''}\n"
    
    # Return as file download
    from fastapi.responses import Response
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=system_logs.csv"}
    )