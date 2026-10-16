"""
CRUD operations for system logs.
"""

from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import desc

from database.session import SessionLocal
from models.log import SystemLog


def get_log(db: Session, log_id: int) -> Optional[SystemLog]:
    """Get log by ID."""
    return db.query(SystemLog).filter(SystemLog.id == log_id).first()


def get_logs(
    db: Session, 
    profile_id: Optional[int] = None, 
    skip: int = 0, 
    limit: int = 50
) -> List[SystemLog]:
    """Get system logs, optionally filtered by profile."""
    query = db.query(SystemLog)
    
    if profile_id:
        query = query.filter(SystemLog.profile_id == profile_id)
    
    return query.order_by(desc(SystemLog.timestamp)).offset(skip).limit(limit).all()


def get_logs_by_profile(db: Session, profile_id: int, skip: int = 0, limit: int = 50) -> List[SystemLog]:
    """Get logs for a specific profile."""
    return get_logs(db, profile_id=profile_id, skip=skip, limit=limit)


def create_log(db: Session, message: str, profile_id: Optional[int] = None) -> SystemLog:
    """Create a new system log."""
    db_log = SystemLog(message=message, profile_id=profile_id)
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log


def clear_logs(db: Session, profile_id: Optional[int] = None) -> int:
    """Clear system logs, optionally for a specific profile."""
    query = db.query(SystemLog)
    
    if profile_id:
        query = query.filter(SystemLog.profile_id == profile_id)
    
    deleted_count = query.delete()
    db.commit()
    return deleted_count