"""
Database session management and base classes.
"""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from config import settings
from pathlib import Path
import base64
import binascii
import re

# Paths - use absolute path for database
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Database URL from environment-backed settings
DATABASE_URL = settings.DATABASE_URL

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
)

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models
Base = declarative_base()


def get_db():
    """Dependency for FastAPI routes to get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables."""
    # Import all models to register them
    from models import profile, workspace, log, simulation, user
    Base.metadata.create_all(bind=engine)
    upgrade_profile_photo_storage()
    migrate_legacy_profile_avatars()


def upgrade_profile_photo_storage():
    """Expand existing MySQL photo columns beyond the 64 KB BLOB limit."""
    if engine.dialect.name != "mysql":
        return
    columns = inspect(engine).get_columns("profile_photos")
    image_column = next((column for column in columns if column["name"] == "image_data"), None)
    if image_column and "LONGBLOB" not in str(image_column["type"]).upper():
        with engine.begin() as connection:
            connection.execute(text(
                "ALTER TABLE profile_photos MODIFY image_data LONGBLOB NOT NULL"
            ))


def migrate_legacy_profile_avatars():
    """Move existing data URI avatars from profiles into profile_photos."""
    from models.profile import Profile, ProfilePhoto

    with SessionLocal() as db:
        for profile in db.query(Profile).filter(Profile.avatar.like("data:%;base64,%")).all():
            match = re.fullmatch(r"data:(image/[\w.+-]+);base64,(.*)", profile.avatar, re.DOTALL)
            if not match:
                continue
            try:
                image_data = base64.b64decode(match.group(2), validate=True)
            except (binascii.Error, ValueError):
                continue
            existing = db.query(ProfilePhoto).filter_by(profile_id=profile.id).first()
            if existing is None:
                db.add(ProfilePhoto(profile_id=profile.id, image_data=image_data, image_type=match.group(1).split("/", 1)[1]))
            profile.avatar = "has_photo"
        db.commit()
