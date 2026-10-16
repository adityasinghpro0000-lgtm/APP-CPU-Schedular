"""
Profile models for user management.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, LargeBinary
from sqlalchemy.orm import relationship
from sqlalchemy.dialects import mysql

from database.session import Base


class Profile(Base):
    """User profile model."""
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    role = Column(String(50), default="Project user")
    # Kept for compatibility with existing databases. New photos live in profile_photos;
    # this column is only a small marker ("has_photo") after migration.
    avatar = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    workspaces = relationship("Workspace", back_populates="owner", cascade="all, delete-orphan")
    logs = relationship("SystemLog", back_populates="profile")

    def to_dict(self) -> dict:
        """Convert profile to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "role": self.role,
            "avatar": self.avatar,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ProfilePhoto(Base):
    """Profile photo storage model."""
    __tablename__ = "profile_photos"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False)
    image_data = Column(LargeBinary().with_variant(mysql.LONGBLOB(), "mysql"), nullable=False)
    image_type = Column(String(10), nullable=False)  # e.g., "jpg", "png"
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    profile = relationship("Profile")

    def to_dict(self) -> dict:
        """Convert photo to dictionary."""
        return {
            "id": self.id,
            "profile_id": self.profile_id,
            "image_type": self.image_type,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
        }
