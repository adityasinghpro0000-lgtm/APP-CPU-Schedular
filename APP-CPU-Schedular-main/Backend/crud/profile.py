"""
CRUD operations for profile management.
"""

from typing import Optional, List
from sqlalchemy.orm import Session

from database.session import SessionLocal
from models.profile import Profile, ProfilePhoto


def get_profile(db: Session, profile_id: int) -> Optional[Profile]:
    """Get profile by ID."""
    return db.query(Profile).filter(Profile.id == profile_id).first()


def get_profile_by_name(db: Session, name: str) -> Optional[Profile]:
    """Get profile by name."""
    return db.query(Profile).filter(Profile.name == name).first()


def get_profiles(db: Session, skip: int = 0, limit: int = 100) -> List[Profile]:
    """Get all profiles."""
    return db.query(Profile).offset(skip).limit(limit).all()


def get_active_profile(db: Session) -> Optional[Profile]:
    """Get the currently active profile."""
    return db.query(Profile).filter(Profile.active == True).first()


def create_profile(db: Session, name: str, role: str = "Project user", avatar: Optional[str] = None) -> Profile:
    """Create a new profile."""
    db_profile = Profile(name=name, role=role, avatar=avatar, active=True)
    
    # Deactivate any existing active profile
    existing_active = db.query(Profile).filter(Profile.active == True).first()
    if existing_active:
        existing_active.active = False
    
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile


def update_profile(db: Session, profile_id: int, **kwargs) -> Optional[Profile]:
    """Update a profile."""
    db_profile = get_profile(db, profile_id)
    if not db_profile:
        return None
    
    for key, value in kwargs.items():
        if hasattr(db_profile, key) and value is not None:
            setattr(db_profile, key, value)
    
    db.commit()
    db.refresh(db_profile)
    return db_profile


def delete_profile(db: Session, profile_id: int) -> bool:
    """Delete a profile."""
    db_profile = get_profile(db, profile_id)
    if not db_profile:
        return False
    
    # Check if this is the only profile
    total_profiles = db.query(Profile).count()
    if total_profiles <= 1:
        return False
    
    # If this is the active profile, activate the first other profile
    if db_profile.active:
        other_profile = db.query(Profile).filter(Profile.id != profile_id).first()
        if other_profile:
            other_profile.active = True
    
    db.delete(db_profile)
    db.commit()
    return True


def set_active_profile(db: Session, profile_id: int) -> Optional[Profile]:
    """Set a profile as active."""
    db_profile = get_profile(db, profile_id)
    if not db_profile:
        return None
    
    # Deactivate all other profiles
    db.query(Profile).update({Profile.active: False})
    
    # Activate the specified profile
    db_profile.active = True
    db.commit()
    db.refresh(db_profile)
    return db_profile


def upload_profile_photo(db: Session, profile_id: int, image_data: bytes, image_type: str) -> Optional[ProfilePhoto]:
    """Upload a profile photo."""
    db_profile = get_profile(db, profile_id)
    if not db_profile:
        return None
    
    db.query(ProfilePhoto).filter(ProfilePhoto.profile_id == profile_id).delete()
    db_photo = ProfilePhoto(
        profile_id=profile_id,
        image_data=image_data,
        image_type=image_type
    )
    
    # Update avatar field to indicate photo exists
    db_profile.avatar = "has_photo"
    
    db.add(db_photo)
    db.commit()
    db.refresh(db_photo)
    return db_photo


def remove_profile_photo(db: Session, profile_id: int) -> bool:
    """Remove a profile photo."""
    db_profile = get_profile(db, profile_id)
    if not db_profile:
        return False
    
    # Remove photo from database
    db.query(ProfilePhoto).filter(ProfilePhoto.profile_id == profile_id).delete()
    
    # Update avatar field
    db_profile.avatar = None
    db.commit()
    return True
