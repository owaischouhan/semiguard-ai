import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session

from ..database.connection import get_db
from ..models.models import Equipment, SensorReadings, Alerts, Predictions
from ..models.schemas import CSVUploadResponse
from ..ml.inference import predict_all
from ..services.dashboard_data import (
    MACHINE_BY_ID,
    ai4i_csv_row_to_series,
    ai4i_row_to_sensor_dict,
    alert_severity,
    derive_machine_status,
    invalidate_dashboard_cache,
    machine_health_score,
    machine_id_for_row,
    missing_ai4i_columns,
    resolve_ai4i_column_map,
    row_timestamp,
)

router = APIRouter(prefix="", tags=["Upload"])


def _ensure_equipment(db: Session, machine_id: str) -> Equipment:
    equipment = db.query(Equipment).filter(Equipment.id == machine_id).first()
    if equipment:
        return equipment

    if machine_id in MACHINE_BY_ID:
        machine = MACHINE_BY_ID[machine_id]
        equipment = Equipment(
            id=machine_id,
            name=machine["name"],
            stage=machine["stage"],
            status="normal",
            health=100.0,
            rul=2000,
            failure_prob=0.0,
        )
    else:
        equipment = Equipment(
            id=machine_id,
            name=f"Station {machine_id}",
            stage="Inspection",
            status="normal",
            health=100.0,
            rul=2000,
            failure_prob=0.0,
        )

    db.add(equipment)
    db.flush()
    return equipment


def _process_row(
    db: Session,
    *,
    machine_id: str,
    timestamp: datetime,
    features_dict: dict,
    records_inserted: int,
) -> bool:
    """Stores one reading, runs inference, and returns True when an alert was created."""
    temperature = features_dict["temperature"]
    pressure = features_dict["pressure"]
    humidity = features_dict["humidity"]
    vibration = features_dict["vibration"]
    particles = features_dict["particles"]
    voltage = features_dict["voltage"]
    current = features_dict["current"]
    yield_val = features_dict["yield"]

    equipment = _ensure_equipment(db, machine_id)

    reading = SensorReadings(
        timestamp=timestamp,
        machine_id=machine_id,
        temperature=temperature,
        pressure=pressure,
        humidity=humidity,
        vibration=vibration,
        particle_count=particles,
        voltage=voltage,
        current=current,
        yield_val=yield_val,
    )
    db.add(reading)

    ml_res = predict_all(features_dict)

    pred = Predictions(
        timestamp=timestamp,
        machine_id=machine_id,
        anomaly_score=ml_res["anomaly_score"],
        risk_level=ml_res["risk_level"],
        fault_type=ml_res["fault_type"],
        fault_confidence=ml_res["fault_confidence"],
        predicted_yield=ml_res["predicted_yield"],
        yield_loss_prob=ml_res["yield_loss_probability"],
        failure_prob=ml_res["failure_probability"],
        predicted_rul=ml_res["predicted_rul"],
        maintenance_urgency=ml_res["maintenance_urgency"],
    )
    db.add(pred)

    severity = alert_severity(ml_res["anomaly_score"])
    if severity:
        alert_id = f"A-{str(int(datetime.utcnow().timestamp()))[-4:]}{records_inserted}"
        desc = f"Process anomaly detected on {machine_id}. " + " ".join(ml_res["recommendations"])
        alert = Alerts(
            id=alert_id,
            machine_id=machine_id,
            type=ml_res["fault_type"],
            severity=severity,
            risk=ml_res["anomaly_score"],
            confidence=ml_res["fault_confidence"],
            timestamp=timestamp,
            description=desc,
            resolved=False,
        )
        db.add(alert)

    equipment.status = derive_machine_status(
        ml_res["anomaly_score"],
        ml_res["failure_probability"],
        ml_res["predicted_rul"],
    )
    equipment.health = machine_health_score(
        ml_res["anomaly_score"],
        ml_res["predicted_rul"],
        ml_res["failure_probability"],
    )
    equipment.rul = int(ml_res["predicted_rul"])
    equipment.failure_prob = ml_res["failure_probability"]

    return severity is not None


@router.post("/upload-data", response_model=CSVUploadResponse)
async def upload_csv_data(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accepts an AI4I CSV file, maps process features, and runs inference on each row."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    try:
        content = await file.read()
        csv_text = content.decode("utf-8-sig")
        csv_reader = csv.DictReader(io.StringIO(csv_text))
        fieldnames = csv_reader.fieldnames or []

        missing = missing_ai4i_columns(fieldnames)
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required column in CSV: {missing[0]}",
            )

        column_map = resolve_ai4i_column_map(fieldnames)
        records_inserted = 0
        anomalies_detected = 0

        for row_index, row in enumerate(csv_reader):
            try:
                ai4i_row = ai4i_csv_row_to_series(row, column_map)
                features_dict = ai4i_row_to_sensor_dict(ai4i_row)
                machine_id = machine_id_for_row(row_index)
                timestamp = row_timestamp(ai4i_row)

                if _process_row(
                    db,
                    machine_id=machine_id,
                    timestamp=timestamp,
                    features_dict=features_dict,
                    records_inserted=records_inserted,
                ):
                    anomalies_detected += 1

                records_inserted += 1
            except Exception as row_error:
                print(f"Skipping CSV row due to format error: {row_error}")

        db.commit()
        invalidate_dashboard_cache()
        return {
            "message": "CSV data successfully uploaded and analyzed.",
            "records_inserted": records_inserted,
            "anomalies_detected": anomalies_detected,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to process CSV file: {e}")
