"""
System log model for tracking user activity.
"""

from datetime import datetime

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

from database.session import Base


class SystemLog(Base):
    """System log model for tracking activity."""
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    profile_id = Column(Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)

    profile = relationship("Profile", back_populates="logs")

    def to_dict(self) -> dict:
        """Convert log to dictionary."""
        return {
            "id": self.id,
            "message": self.message,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "profile_id": self.profile_id,
        }