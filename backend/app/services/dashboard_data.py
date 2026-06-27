from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from ..ml.inference import explain_root_cause, predict_all_batch
from ..ml.train import load_ai4i_dataset
from ..models.models import Alerts, Equipment, Predictions, SensorReadings

PROCESS_STAGES = [
    "Wafer Preparation",
    "Oxidation",
    "Photolithography",
    "Etching",
    "Ion Implantation",
    "Deposition",
    "CMP",
    "Inspection",
    "Packaging",
]

MACHINE_CONFIG = [
    {"id": "WP-01", "name": "Wafer Prep Station 01", "stage": "Wafer Preparation"},
    {"id": "OX-02", "name": "Oxidation Furnace 02", "stage": "Oxidation"},
    {"id": "LI-03", "name": "Litho Scanner ASML-03", "stage": "Photolithography"},
    {"id": "ET-04", "name": "Etching Chamber #4", "stage": "Etching"},
    {"id": "II-05", "name": "Ion Implanter 05", "stage": "Ion Implantation"},
    {"id": "DP-06", "name": "PECVD Deposition 06", "stage": "Deposition"},
    {"id": "CM-07", "name": "CMP Polisher 07", "stage": "CMP"},
    {"id": "IN-08", "name": "AOI Inspector 08", "stage": "Inspection"},
    {"id": "PK-09", "name": "Packaging Bonder 09", "stage": "Packaging"},
]

MACHINE_BY_ID = {machine["id"]: machine for machine in MACHINE_CONFIG}
MACHINE_ORDER = {machine["id"]: index for index, machine in enumerate(MACHINE_CONFIG)}

TYPE_ENCODING = {"M": 0.0, "L": 1.0, "H": 2.0}
DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
BASE_TIMESTAMP = datetime(2020, 1, 1)

_cache: Optional[List[Dict[str, Any]]] = None
_cache_source: Optional[str] = None


def derived_yield_from_sensor(sensor: Dict[str, float]) -> float:
    """Derives yield from mapped process features (same formula used in model training)."""
    return float(
        np.clip(
            98.0 - sensor["particles"] * 0.01 - sensor["current"] * 0.03,
            0.0,
            100.0,
        )
    )


def actual_yield_from_row(row: pd.Series) -> float:
    """Derives yield target from real AI4I process features."""
    return float(
        np.clip(
            98.0 - row["Tool wear [min]"] * 0.01 - row["Torque [Nm]"] * 0.03,
            0.0,
            100.0,
        )
    )


AI4I_REQUIRED_COLUMNS = [
    "UDI",
    "Product ID",
    "Type",
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
    "Machine failure",
    "TWF",
    "HDF",
    "PWF",
    "OSF",
    "RNF",
]


AI4I_NUMERIC_COLUMNS = {
    "UDI",
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
    "Machine failure",
    "TWF",
    "HDF",
    "PWF",
    "OSF",
    "RNF",
}


def resolve_ai4i_column_map(fieldnames: List[str]) -> Dict[str, str]:
    """Maps canonical AI4I column names to the exact CSV header strings."""
    normalized = {name.strip().lstrip("\ufeff").lower(): name for name in fieldnames if name}
    return {
        column: normalized[column.lower()]
        for column in AI4I_REQUIRED_COLUMNS
        if column.lower() in normalized
    }


def missing_ai4i_columns(fieldnames: List[str]) -> List[str]:
    """Returns canonical AI4I columns absent from the CSV header."""
    resolved = resolve_ai4i_column_map(fieldnames)
    return [column for column in AI4I_REQUIRED_COLUMNS if column not in resolved]


def ai4i_csv_row_to_series(row: Dict[str, str], column_map: Dict[str, str]) -> pd.Series:
    """Builds a pandas Series with canonical AI4I keys from a CSV DictReader row."""
    data: Dict[str, Any] = {}
    for column, header in column_map.items():
        raw_value = row[header]
        if column in AI4I_NUMERIC_COLUMNS:
            data[column] = float(raw_value) if raw_value not in (None, "") else 0.0
        else:
            data[column] = raw_value.strip() if isinstance(raw_value, str) else raw_value
    return pd.Series(data)


def ai4i_row_to_sensor_dict(row: pd.Series) -> Dict[str, float]:
    """Maps an AI4I CSV row to the frontend sensor schema used by predict_all()."""
    failure_flags = float(row["TWF"] + row["HDF"] + row["PWF"] + row["OSF"] + row["RNF"])
    return {
        "temperature": float(row["Air temperature [K]"]),
        "pressure": float(row["Process temperature [K]"]),
        "humidity": TYPE_ENCODING.get(str(row["Type"]), 0.0) + failure_flags,
        "vibration": float(row["Rotational speed [rpm]"]),
        "particles": float(row["Tool wear [min]"]),
        "voltage": float(row["Machine failure"] + row["TWF"] + row["HDF"]),
        "current": float(row["Torque [Nm]"]),
        "yield": actual_yield_from_row(row),
    }


def reading_to_sensor_dict(reading: SensorReadings) -> Dict[str, float]:
    """Maps a stored sensor reading to the inference input schema."""
    sensor = {
        "temperature": reading.temperature,
        "pressure": reading.pressure,
        "humidity": reading.humidity,
        "vibration": reading.vibration,
        "particles": reading.particle_count,
        "voltage": reading.voltage,
        "current": reading.current,
        "yield": reading.yield_val if reading.yield_val is not None else 0.0,
    }
    if reading.yield_val is None:
        sensor["yield"] = derived_yield_from_sensor(sensor)
    return sensor


def machine_index_for_row(row_index: int) -> int:
    return row_index % len(MACHINE_CONFIG)


def machine_id_for_row(row_index: int) -> str:
    return MACHINE_CONFIG[machine_index_for_row(row_index)]["id"]


def machine_health_score(
    anomaly_score: float,
    predicted_rul: float,
    failure_probability: float,
) -> float:
    """Combines anomaly score, failure probability, and RUL into a 0-100 health index."""
    anomaly_component = 100.0 - anomaly_score * 50.0
    rul_component = float(np.clip(predicted_rul / 2500.0, 0.0, 1.0) * 100.0)
    failure_component = float((1.0 - failure_probability) * 100.0)
    return float(
        np.clip(
            (anomaly_component + rul_component + failure_component) / 3.0,
            10.0,
            100.0,
        )
    )


def derive_machine_status(
    anomaly_score: float,
    failure_probability: float,
    predicted_rul: float,
) -> str:
    """Maps inference outputs to normal, warning, or critical status."""
    if anomaly_score > 0.8 or failure_probability > 0.7 or predicted_rul < 100:
        return "critical"
    if anomaly_score > 0.5 or failure_probability > 0.4 or predicted_rul < 500:
        return "warning"
    return "normal"


def alert_severity(anomaly_score: float) -> Optional[str]:
    if anomaly_score > 0.8:
        return "critical"
    if anomaly_score > 0.5:
        return "warning"
    return None


def row_timestamp(row: pd.Series) -> datetime:
    udi = int(row["UDI"])
    return BASE_TIMESTAMP + timedelta(minutes=udi * 5)


def has_uploaded_data(db: Session) -> bool:
    return db.query(Predictions.id).first() is not None


def invalidate_dashboard_cache() -> None:
    """Clears cached dashboard inference so the next request reloads fresh data."""
    global _cache, _cache_source
    _cache = None
    _cache_source = None


def get_active_source(db: Session) -> str:
    return "upload" if has_uploaded_data(db) else "ai4i"


def get_inference_cache(db: Session) -> List[Dict[str, Any]]:
    """Returns cached inference records, preferring uploaded DB data when available."""
    global _cache, _cache_source

    source = get_active_source(db)
    if _cache is not None and _cache_source == source:
        return _cache

    if source == "upload":
        _cache = build_inference_records_from_db(db)
    else:
        _cache = build_inference_records(load_ai4i_dataset())

    _cache_source = source
    return _cache


def warm_inference_cache(db: Session) -> None:
    get_inference_cache(db)


def prediction_to_inference(prediction: Predictions) -> Dict[str, Any]:
    return {
        "anomaly_score": prediction.anomaly_score,
        "risk_level": prediction.risk_level,
        "fault_type": prediction.fault_type,
        "fault_confidence": prediction.fault_confidence,
        "predicted_yield": prediction.predicted_yield,
        "yield_loss_probability": prediction.yield_loss_prob,
        "predicted_rul": prediction.predicted_rul,
        "failure_probability": prediction.failure_prob,
        "maintenance_urgency": prediction.maintenance_urgency,
        "shap_values": [],
        "recommendations": [],
    }


def build_inference_records(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Runs predict_all-equivalent inference on every AI4I record."""
    sensor_dicts = [ai4i_row_to_sensor_dict(row) for _, row in df.iterrows()]
    inferences = predict_all_batch(sensor_dicts)

    alert_indices = {
        index
        for index, inference in enumerate(inferences)
        if alert_severity(inference["anomaly_score"]) is not None
    }

    if alert_indices:
        for index in alert_indices:
            explain_data = explain_root_cause(sensor_dicts[index])
            inferences[index]["shap_values"] = explain_data["shap_values"]
            inferences[index]["recommendations"] = explain_data["recommendations"]

    records: List[Dict[str, Any]] = []
    for row_index, ((_, row), sensor_dict, inference) in enumerate(
        zip(df.iterrows(), sensor_dicts, inferences)
    ):
        records.append(
            _make_record(
                row_index=row_index,
                row_id=int(row["UDI"]),
                product_id=str(row["Product ID"]),
                machine_id=machine_id_for_row(row_index),
                timestamp=row_timestamp(row),
                sensor_dict=sensor_dict,
                inference=inference,
            )
        )

    return records


def build_inference_records_from_db(db: Session) -> List[Dict[str, Any]]:
    """Builds inference records from uploaded sensor readings and saved predictions."""
    pairs: List[Tuple[SensorReadings, Predictions]] = (
        db.query(SensorReadings, Predictions)
        .filter(
            SensorReadings.machine_id == Predictions.machine_id,
            SensorReadings.timestamp == Predictions.timestamp,
        )
        .order_by(SensorReadings.timestamp)
        .all()
    )

    records: List[Dict[str, Any]] = []
    for row_index, (reading, prediction) in enumerate(pairs):
        sensor_dict = reading_to_sensor_dict(reading)
        inference = prediction_to_inference(prediction)
        severity = alert_severity(inference["anomaly_score"])

        if severity:
            explain_data = explain_root_cause(sensor_dict)
            inference["shap_values"] = explain_data["shap_values"]
            inference["recommendations"] = explain_data["recommendations"]

        records.append(
            _make_record(
                row_index=row_index,
                row_id=reading.id,
                product_id=reading.machine_id,
                machine_id=reading.machine_id,
                timestamp=reading.timestamp,
                sensor_dict=sensor_dict,
                inference=inference,
            )
        )

    return records


def _make_record(
    row_index: int,
    row_id: int,
    product_id: str,
    machine_id: str,
    timestamp: datetime,
    sensor_dict: Dict[str, float],
    inference: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "row_index": row_index,
        "udi": row_id,
        "product_id": product_id,
        "machine_id": machine_id,
        "machine_index": machine_index_for_row(row_index),
        "timestamp": timestamp,
        "sensor": sensor_dict,
        "actual_yield": sensor_dict["yield"],
        "inference": inference,
        "health": machine_health_score(
            inference["anomaly_score"],
            inference["predicted_rul"],
            inference["failure_probability"],
        ),
        "severity": alert_severity(inference["anomaly_score"]),
    }


def _ordered_machine_ids(records: List[Dict[str, Any]], db: Session) -> List[str]:
    machine_ids = sorted({record["machine_id"] for record in records})
    return sorted(machine_ids, key=lambda machine_id: (MACHINE_ORDER.get(machine_id, 999), machine_id))


def _equipment_meta(db: Session, machine_id: str) -> Dict[str, str]:
    equipment = db.query(Equipment).filter(Equipment.id == machine_id).first()
    if equipment:
        return {"name": equipment.name, "stage": equipment.stage}
    if machine_id in MACHINE_BY_ID:
        machine = MACHINE_BY_ID[machine_id]
        return {"name": machine["name"], "stage": machine["stage"]}
    return {"name": f"Station {machine_id}", "stage": "Inspection"}


def get_equipment_health(db: Session) -> List[Dict[str, Any]]:
    records = get_inference_cache(db)
    equipment: List[Dict[str, Any]] = []
    machine_ids = _ordered_machine_ids(records, db)

    for machine_id in machine_ids:
        machine_records = [record for record in records if record["machine_id"] == machine_id]
        if not machine_records:
            continue

        meta = _equipment_meta(db, machine_id)
        avg_anomaly = sum(
            record["inference"]["anomaly_score"] for record in machine_records
        ) / len(machine_records)
        avg_failure_prob = sum(
            record["inference"]["failure_probability"] for record in machine_records
        ) / len(machine_records)
        avg_rul = sum(record["inference"]["predicted_rul"] for record in machine_records) / len(
            machine_records
        )
        worst_record = max(
            machine_records,
            key=lambda record: record["inference"]["anomaly_score"],
        )
        worst_inference = worst_record["inference"]
        status = derive_machine_status(
            worst_inference["anomaly_score"],
            worst_inference["failure_probability"],
            worst_inference["predicted_rul"],
        )
        avg_health = machine_health_score(avg_anomaly, avg_rul, avg_failure_prob)

        equipment.append(
            {
                "id": machine_id,
                "name": meta["name"],
                "stage": meta["stage"],
                "status": status,
                "health": round(avg_health, 1),
                "anomaly_score": round(avg_anomaly, 4),
                "rul": int(round(avg_rul)),
                "failure_prob": round(avg_failure_prob, 4),
            }
        )

    return equipment


def build_alert(record: Dict[str, Any]) -> Dict[str, Any]:
    inference = record["inference"]
    recommendations = inference["recommendations"]
    description = (
        f"Process anomaly detected on {record['machine_id']} (Product {record['product_id']}). "
        + " ".join(recommendations)
    )

    return {
        "id": f"A-{record['udi']}",
        "machine_id": record["machine_id"],
        "type": inference["fault_type"],
        "severity": record["severity"],
        "risk": round(inference["anomaly_score"], 4),
        "confidence": round(inference["fault_confidence"], 4),
        "timestamp": record["timestamp"],
        "description": description,
        "resolved": False,
    }


def _alert_from_model(alert: Alerts) -> Dict[str, Any]:
    return {
        "id": alert.id,
        "machine_id": alert.machine_id,
        "type": alert.type,
        "severity": alert.severity,
        "risk": alert.risk,
        "confidence": alert.confidence,
        "timestamp": alert.timestamp,
        "description": alert.description,
        "resolved": alert.resolved,
    }


def get_alerts(db: Session, limit: int = 200) -> List[Dict[str, Any]]:
    if get_active_source(db) == "upload":
        alerts = (
            db.query(Alerts)
            .filter(Alerts.resolved == False)
            .order_by(Alerts.risk.desc(), Alerts.timestamp.desc())
            .limit(limit)
            .all()
        )
        return [_alert_from_model(alert) for alert in alerts]

    records = get_inference_cache(db)
    alert_records = [
        record for record in records if record["severity"] in {"warning", "critical"}
    ]
    alert_records.sort(key=lambda record: record["inference"]["anomaly_score"], reverse=True)
    return [build_alert(record) for record in alert_records[:limit]]


def get_dashboard_summary(db: Session) -> Dict[str, Any]:
    records = get_inference_cache(db)
    equipment = get_equipment_health(db)
    alerts = get_alerts(db)

    predicted_yields = [record["inference"]["predicted_yield"] for record in records]
    health_scores = [record["health"] for record in records]

    current_yield = sum(predicted_yields) / len(predicted_yields)
    predicted_yield_24h = current_yield
    fab_health = sum(health_scores) / len(health_scores)

    warnings_count = sum(1 for record in records if record["severity"] == "warning")
    critical_count = sum(1 for record in records if record["severity"] == "critical")
    active_machines = sum(1 for machine in equipment if machine["status"] != "critical")

    yield_trend = []
    bin_size = max(len(records) // len(DAY_LABELS), 1)
    for day_index, day in enumerate(DAY_LABELS):
        start = day_index * bin_size
        end = start + bin_size if day_index < len(DAY_LABELS) - 1 else len(records)
        bucket = records[start:end]
        if not bucket:
            continue

        actual_avg = sum(record["actual_yield"] for record in bucket) / len(bucket)
        predicted_avg = sum(record["inference"]["predicted_yield"] for record in bucket) / len(
            bucket
        )
        yield_trend.append(
            {
                "day": day,
                "yield": round(actual_avg, 2),
                "predicted": round(predicted_avg, 2),
            }
        )

    stage_throughput = []
    for machine in equipment:
        machine_records = [record for record in records if record["machine_id"] == machine["id"]]
        if machine_records:
            avg_rpm = sum(record["sensor"]["vibration"] for record in machine_records) / len(
                machine_records
            )
            wph = int(round(avg_rpm / 10.0))
        else:
            wph = 0

        stage_throughput.append(
            {
                "stage": machine["stage"].split(" ")[0],
                "wph": wph,
            }
        )

    process_status = [
        {
            "stage": machine["stage"],
            "machineId": machine["id"],
            "name": machine["name"],
            "health": machine["health"],
            "status": machine["status"],
        }
        for machine in equipment
    ]

    return {
        "fab_health": round(fab_health, 1),
        "active_machines": active_machines,
        "total_machines": len(equipment),
        "current_yield": round(current_yield, 1),
        "predicted_yield_24h": round(predicted_yield_24h, 1),
        "warnings_count": warnings_count,
        "critical_count": critical_count,
        "yield_trend": yield_trend,
        "stage_throughput": stage_throughput,
        "latest_alerts": alerts[:5],
        "process_status": process_status,
    }


def get_sensor_history(db: Session, limit: int = 40) -> List[Dict[str, Any]]:
    records = get_inference_cache(db)
    history_records = records[-limit:]
    return [
        {
            "t": int(record["timestamp"].timestamp() * 1000),
            "temperature": record["sensor"]["temperature"],
            "pressure": record["sensor"]["pressure"],
            "humidity": record["sensor"]["humidity"],
            "vibration": record["sensor"]["vibration"],
            "particles": record["sensor"]["particles"],
            "voltage": record["sensor"]["voltage"],
            "current": record["sensor"]["current"],
            "yield": record["inference"]["predicted_yield"],
        }
        for record in history_records
    ]


def get_yield_forecast(db: Session, horizon: int = 12) -> List[Dict[str, Any]]:
    records = get_inference_cache(db)
    if not records:
        return []

    step = max(len(records) // horizon, 1)
    forecast: List[Dict[str, Any]] = []
    for hour_index in range(horizon):
        start = len(records) - (horizon - hour_index) * step
        end = start + step
        bucket = records[max(start, 0) : max(end, 0)] or records[-1:]
        expected = sum(record["inference"]["predicted_yield"] for record in bucket) / len(bucket)
        risk = sum(record["inference"]["yield_loss_probability"] for record in bucket) / len(
            bucket
        )
        forecast.append(
            {
                "h": f"+{hour_index + 1}h",
                "expected": round(expected, 2),
                "risk": round(risk * 100.0, 2),
            }
        )

    return forecast


def get_root_cause(db: Session, machine_id: Optional[str] = None) -> Dict[str, Any]:
    records = get_inference_cache(db)

    if machine_id:
        machine_records = [record for record in records if record["machine_id"] == machine_id]
    else:
        machine_records = records

    if not machine_records:
        raise ValueError("No inference records available for root cause analysis.")

    target = max(machine_records, key=lambda record: record["inference"]["anomaly_score"])
    inference = dict(target["inference"])
    explain_data = explain_root_cause(target["sensor"])
    inference["shap_values"] = explain_data["shap_values"]
    inference["recommendations"] = explain_data["recommendations"]

    return {
        "machine_id": target["machine_id"],
        "anomaly_score": inference["anomaly_score"],
        "risk_level": inference["risk_level"],
        "fault_type": inference["fault_type"],
        "confidence_score": inference["fault_confidence"],
        "predicted_yield": inference["predicted_yield"],
        "predicted_rul": inference["predicted_rul"],
        "failure_probability": inference["failure_probability"],
        "maintenance_urgency": inference["maintenance_urgency"],
        "shap_values": inference["shap_values"],
        "recommendations": inference["recommendations"],
    }
