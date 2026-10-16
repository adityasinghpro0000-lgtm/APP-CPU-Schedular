"""
Profile management routes.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from models.profile import ProfilePhoto

from database.session import get_db
from schemas.profile import ProfileCreate, ProfileUpdate, ProfileResponse
from crud.profile import (
    get_profiles, create_profile, update_profile, delete_profile,
    set_active_profile, get_profile, get_profile_by_name,
    upload_profile_photo, remove_profile_photo
)

router = APIRouter()


@router.get("/", response_model=List[ProfileResponse])
async def read_profiles(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get all profiles."""
    profiles = get_profiles(db, skip=skip, limit=limit)
    return profiles


@router.get("/{profile_id}", response_model=ProfileResponse)
async def read_profile(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific profile by ID."""
    profile = get_profile(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("/", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile_endpoint(
    name: str = Form(...),
    role: str = Form("Project user"),
    db: Session = Depends(get_db)
):
    """Create a new profile."""
    # Check if profile with this name already exists
    existing = get_profile_by_name(db, name=name)
    if existing:
        raise HTTPException(status_code=400, detail="Profile name already exists")
    
    profile = create_profile(db, name=name, role=role)
    return profile


@router.put("/{profile_id}", response_model=ProfileResponse)
async def update_profile_endpoint(
    profile_id: int,
    profile: ProfileUpdate,
    db: Session = Depends(get_db)
):
    """Update a profile."""
    db_profile = update_profile(db, profile_id, **profile.dict(exclude_unset=True))
    if db_profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return db_profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile_endpoint(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """Delete a profile."""
    if not delete_profile(db, profile_id):
        raise HTTPException(status_code=404, detail="Profile not found or cannot delete last profile")
    return None


@router.post("/{profile_id}/activate", response_model=ProfileResponse)
async def activate_profile(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """Activate a profile."""
    profile = set_active_profile(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.post("/{profile_id}/photo", response_model=ProfileResponse)
async def upload_profile_photo_endpoint(
    profile_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a profile photo."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Read file content
    image_data = await file.read()
    image_type = file.content_type.split("/", 1)[1]
    
    photo = upload_profile_photo(db, profile_id, image_data, image_type)
    if photo is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile = get_profile(db, profile_id)
    return profile


@router.get("/{profile_id}/photo")
async def read_profile_photo(profile_id: int, db: Session = Depends(get_db)):
    """Serve a profile photo without embedding its bytes in profile responses."""
    photo = db.query(ProfilePhoto).filter_by(profile_id=profile_id).first()
    if photo is None:
        raise HTTPException(status_code=404, detail="Profile photo not found")
    media_type = photo.image_type if photo.image_type.startswith("image/") else f"image/{photo.image_type}"
    return Response(content=photo.image_data, media_type=media_type, headers={"Cache-Control": "no-store"})


@router.delete("/{profile_id}/photo", response_model=ProfileResponse)
async def remove_profile_photo_endpoint(
    profile_id: int,
    db: Session = Depends(get_db)
):
    """Remove a profile photo."""
    if not remove_profile_photo(db, profile_id):
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile = get_profile(db, profile_id)
    return profile
