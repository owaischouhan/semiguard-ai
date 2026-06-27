from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database.connection import get_db
from ..models.schemas import AlertResponse, DashboardSummaryResponse, EquipmentResponse
from ..services.dashboard_data import (
    get_alerts,
    get_dashboard_summary,
    get_equipment_health,
    get_root_cause,
    get_sensor_history,
    get_yield_forecast,
)
from ..utils.pdf import generate_report_pdf

router = APIRouter(prefix="", tags=["Dashboard"])


@router.get("/equipment-health", response_model=List[EquipmentResponse])
def get_equipment_health_endpoint(db: Session = Depends(get_db)):
    """Returns equipment health derived from uploaded data or AI4I inference."""
    try:
        return get_equipment_health(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch equipment health: {e}")


@router.get("/alerts", response_model=List[AlertResponse])
def get_alerts_endpoint(db: Session = Depends(get_db)):
    """Returns alerts from uploaded data or AI4I anomaly scores."""
    try:
        return get_alerts(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch alerts: {e}")


@router.get("/dashboard-summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary_endpoint(db: Session = Depends(get_db)):
    """Aggregates uploaded or AI4I records for the Executive Dashboard."""
    try:
        return get_dashboard_summary(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile dashboard summary: {e}")


@router.get("/export-pdf")
def export_pdf_report(db: Session = Depends(get_db)):
    """Triggers report compile and outputs PDF file stream."""
    try:
        pdf_stream = generate_report_pdf(db)
        return StreamingResponse(
            pdf_stream,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=semiguard_fab_report.pdf"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF report compilation failed: {e}")


@router.get("/sensor-history")
def get_sensor_history_endpoint(db: Session = Depends(get_db)):
    """Returns recent sensor readings from uploaded data or AI4I records."""
    try:
        return get_sensor_history(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sensor history: {e}")


@router.get("/yield-forecast")
def get_yield_forecast_endpoint(db: Session = Depends(get_db)):
    """Returns a yield forecast derived from model predictions."""
    try:
        return get_yield_forecast(db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compile yield forecast: {e}")


@router.get("/root-cause")
def get_root_cause_endpoint(machine_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Returns explainability for the highest-risk record on a machine."""
    try:
        return get_root_cause(db, machine_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SHAP explanation compilation failed: {e}")
