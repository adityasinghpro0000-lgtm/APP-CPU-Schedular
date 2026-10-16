"""
API version 1 package initialization.
"""

from .auth import router as auth_router
from .profiles import router as profiles_router
from .workspaces import router as workspaces_router
from .logs import router as logs_router
from .workload import router as workload_router
from .simulations import router as simulations_router
from .programs import router as programs_router

from fastapi import APIRouter

router = APIRouter(prefix="/api/v1")

# Include all routers
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(profiles_router, prefix="/profiles", tags=["profiles"])
router.include_router(workspaces_router, prefix="/workspaces", tags=["workspaces"])
router.include_router(logs_router, prefix="/logs", tags=["logs"])
router.include_router(workload_router, prefix="/workload", tags=["workload"])
router.include_router(simulations_router, prefix="/simulations", tags=["simulations"])
router.include_router(programs_router, prefix="/programs", tags=["programs"])
