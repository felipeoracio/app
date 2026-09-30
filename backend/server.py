import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from routers.ai import router as ai_router
from routers.auth import router as auth_router
from routers.documents import router as documents_router

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

api_router.include_router(ai_router)
api_router.include_router(documents_router)
api_router.include_router(auth_router)


@api_router.get("/")
async def root() -> dict[str, str]:
    return {"message": "UnoWord AI API is running"}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Keep this as the final statement: every route is registered on api_router above.
app.include_router(api_router)
