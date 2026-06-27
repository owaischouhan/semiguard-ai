import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database.connection import engine, Base, SessionLocal
from .models.models import Equipment, SensorReadings, Alerts
from .routes import upload, predict, dashboard, model_performance
from .ml.inference import load_models_safely
from .services.dashboard_data import warm_inference_cache

# Logger setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

# Default equipment configuration matching the original cleanroom simulator
INITIAL_MACHINES = [
    {"id": "WP-01", "name": "Wafer Prep Station 01", "stage": "Wafer Preparation", "status": "normal", "health": 96.0, "rul": 1820, "failure_prob": 0.04},
    {"id": "OX-02", "name": "Oxidation Furnace 02", "stage": "Oxidation", "status": "normal", "health": 91.0, "rul": 1420, "failure_prob": 0.07},
    {"id": "LI-03", "name": "Litho Scanner ASML-03", "stage": "Photolithography", "status": "warning", "health": 78.0, "rul": 640, "failure_prob": 0.22},
    {"id": "ET-04", "name": "Etching Chamber #4", "stage": "Etching", "status": "critical", "health": 54.0, "rul": 18, "failure_prob": 0.71},
    {"id": "II-05", "name": "Ion Implanter 05", "stage": "Ion Implantation", "status": "normal", "health": 88.0, "rul": 1180, "failure_prob": 0.09},
    {"id": "DP-06", "name": "PECVD Deposition 06", "stage": "Deposition", "status": "warning", "health": 73.0, "rul": 510, "failure_prob": 0.28},
    {"id": "CM-07", "name": "CMP Polisher 07", "stage": "CMP", "status": "normal", "health": 93.0, "rul": 1610, "failure_prob": 0.05},
    {"id": "IN-08", "name": "AOI Inspector 08", "stage": "Inspection", "status": "normal", "health": 97.0, "rul": 2100, "failure_prob": 0.03},
    {"id": "PK-09", "name": "Packaging Bonder 09", "stage": "Packaging", "status": "normal", "health": 90.0, "rul": 1340, "failure_prob": 0.08},
]

# Initial process alerts matching the simulator
INITIAL_ALERTS = [
    {
        "id": "A-1042",
        "machine_id": "ET-04",
        "type": "Vibration Anomaly",
        "severity": "critical",
        "risk": 0.91,
        "confidence": 0.96,
        "description": "Chamber spindle vibration deviates +3.8σ from baseline. Bearing wear pattern detected. Replace spindle bearing assembly within 18 hours."
    },
    {
        "id": "A-1041",
        "machine_id": "LI-03",
        "type": "Temperature Drift",
        "severity": "warning",
        "risk": 0.62,
        "confidence": 0.88,
        "description": "Reticle stage temperature drifting at 0.04 °C/min — overlay registration risk. Recalibrate during next 24h idle window."
    },
    {
        "id": "A-1040",
        "machine_id": "DP-06",
        "type": "Particle Contamination",
        "severity": "warning",
        "risk": 0.58,
        "confidence": 0.82,
        "description": "Particle count >0.1 µm spiked to 38 cnt/L. Possible chamber seal degradation. Schedule maintenance within 5 days."
    },
    {
        "id": "A-1039",
        "machine_id": "OX-02",
        "type": "Pressure Instability",
        "severity": "normal",
        "risk": 0.21,
        "confidence": 0.74,
        "description": "Minor process pressure oscillation within tolerance. Self-corrected."
    }
]

def seed_database(db):
    """Inserts initial equipment, alerts, and baseline telemetry if empty."""
    # Seed Equipment
    if db.query(Equipment).count() == 0:
        logger.info("Seeding equipment profiles...")
        for m in INITIAL_MACHINES:
            equipment = Equipment(**m)
            db.add(equipment)
        db.commit()

    # Seed Alerts
    if db.query(Alerts).count() == 0:
        logger.info("Seeding baseline process alerts...")
        for a in INITIAL_ALERTS:
            alert = Alerts(**a)
            db.add(alert)
        db.commit()

    # Seed initial sensor reading series for charts to load immediately
    if db.query(SensorReadings).count() == 0:
        logger.info("Seeding initial sensor readings series...")
        import random
        from datetime import datetime, timedelta
        
        now = datetime.utcnow()
        for m in INITIAL_MACHINES:
            m_id = m["id"]
            # Seed 20 historical readings per machine spaced by 5 mins
            for i in range(20):
                t = now - timedelta(minutes=(20 - i) * 5)
                # Introduce slight drift if warning or critical
                vibe_base = 0.42 + (0.3 if m["status"] == "warning" else 0.6 if m["status"] == "critical" else 0)
                temp_base = 420.0 + (10 if m["status"] == "warning" else 25 if m["status"] == "critical" else 0)
                part_base = 12.0 + (15 if m["status"] == "warning" else 35 if m["status"] == "critical" else 0)

                reading = SensorReadings(
                    timestamp=t,
                    machine_id=m_id,
                    temperature=random.normalvariate(temp_base, 2),
                    pressure=random.normalvariate(1.02, 0.02),
                    humidity=random.normalvariate(38, 1.0),
                    vibration=random.normalvariate(vibe_base, 0.03),
                    particle_count=max(0.0, random.normalvariate(part_base, 2.0)),
                    voltage=random.normalvariate(13.8, 0.1),
                    current=random.normalvariate(48.0, 0.5),
                    yield_val=random.normalvariate(94.5 - (0.5 * vibe_base), 0.2)
                )
                db.add(reading)
        db.commit()
        logger.info("Database seeding completed successfully.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Database Setup
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
        
    # Startup: Load / Train ML models
    logger.info("Loading ML models...")
    load_models_safely()

    db = SessionLocal()
    try:
        logger.info("Building dashboard inference cache...")
        warm_inference_cache(db)
    finally:
        db.close()
    
    yield
    # Shutdown logic (optional)

app = FastAPI(
    title="SemiGuard AI Backend",
    description="REST API serving semiconductor process control, anomaly detection, yield forecast, and RUL models.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS Middleware config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all origins for local pairing, restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Route registration
app.include_router(upload.router)
app.include_router(predict.router)
app.include_router(dashboard.router)
app.include_router(model_performance.router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "api": "SemiGuard AI API",
        "version": "1.0.0",
        "docs": "/docs"
    }

@app.get("/status")
def get_system_status(db = None):
    """Returns comprehensive system status for the System Control Center."""
    from datetime import datetime
    import os
    
    if db is None:
        db = SessionLocal()
    
    try:
        # Database type detection
        database_type = "sqlite" if "sqlite" in str(engine.url).lower() else "postgres"
        
        # Model count
        models_loaded = 0
        models_dir = os.path.join(os.path.dirname(__file__), "ml", "models")
        if os.path.exists(models_dir):
            models_loaded = len([f for f in os.listdir(models_dir) if f.endswith(".joblib")])
        
        # Dataset info
        dataset_records = db.query(SensorReadings).count()
        
        return {
            "backend": "online",
            "database": database_type,
            "models_loaded": models_loaded,
            "dataset_name": "AI4I 2020 Predictive Maintenance",
            "dataset_records": dataset_records,
            "api_status": "healthy",
            "last_sync": datetime.utcnow().isoformat(),
            "app_version": "1.0.0"
        }
    except Exception as e:
        logger.error(f"Error fetching system status: {e}")
        return {
            "backend": "offline",
            "database": "unknown",
            "models_loaded": 0,
            "dataset_name": "Unknown",
            "dataset_records": 0,
            "api_status": "down",
            "last_sync": datetime.utcnow().isoformat(),
            "app_version": "1.0.0"
        }
    finally:
        if db:
            db.close()
