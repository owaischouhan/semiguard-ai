import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Fetch database URL from environment variables.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./semiguard.db")

# Normalize legacy postgres URLs; otherwise default to SQLite for local development.
if DATABASE_URL.startswith("postgresql"):
    pass
elif DATABASE_URL.startswith("sqlite"):
    logger.info("Using SQLite database for local development.")
else:
    logger.warning("Unrecognized DATABASE_URL scheme. Falling back to local SQLite database.")
    DATABASE_URL = "sqlite:///./semiguard.db"

# Create engine. If SQLite, we need connect_args to allow multithreading.
engine_args = {}
if DATABASE_URL.startswith("sqlite"):
    engine_args["connect_args"] = {"check_same_thread": False}

try:
    engine = create_engine(DATABASE_URL, **engine_args)
    # Test connection
    with engine.connect() as conn:
        logger.info(f"Successfully connected to database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
except Exception as e:
    logger.error(f"Failed to connect to database at {DATABASE_URL}. Error: {e}")
    if not DATABASE_URL.startswith("sqlite"):
        logger.warning("PostgreSQL connection failed. Falling back to SQLite for runtime stability.")
        DATABASE_URL = "sqlite:///./semiguard.db"
        engine_args["connect_args"] = {"check_same_thread": False}
        engine = create_engine(DATABASE_URL, **engine_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """Dependency for retrieving DB session in FastAPI routes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
