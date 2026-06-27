from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime

class SensorReadingBase(BaseModel):
    temperature: float
    pressure: float
    humidity: float
    vibration: float
    particle_count: float = Field(..., alias="particles")
    voltage: float
    current: float
    yield_val: Optional[float] = Field(None, alias="yield")

    class Config:
        populate_by_name = True

class SensorReadingCreate(SensorReadingBase):
    machine_id: str
    timestamp: Optional[datetime] = None

class SensorReadingResponse(SensorReadingBase):
    id: int
    machine_id: str
    timestamp: datetime

    class Config:
        from_attributes = True
        populate_by_name = True

class EquipmentBase(BaseModel):
    id: str
    name: str
    stage: str
    status: str
    health: float
    anomaly_score: float
    rul: int
    failure_prob: float

class EquipmentResponse(EquipmentBase):
    class Config:
        from_attributes = True

class AlertBase(BaseModel):
    id: str
    machine_id: str
    type: str
    severity: str
    risk: float
    confidence: float
    timestamp: datetime
    description: str
    resolved: bool

class AlertResponse(AlertBase):
    class Config:
        from_attributes = True

class PredictionResponse(BaseModel):
    id: int
    timestamp: datetime
    machine_id: str
    anomaly_score: float
    risk_level: str
    fault_type: str
    fault_confidence: float
    predicted_yield: float
    yield_loss_prob: float
    failure_prob: float
    predicted_rul: float
    maintenance_urgency: str

    class Config:
        from_attributes = True

class MaintenanceHistoryBase(BaseModel):
    machine_id: str
    action: str
    status: str
    notes: Optional[str] = None

class MaintenanceHistoryResponse(MaintenanceHistoryBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class YieldTrendPoint(BaseModel):
    day: str
    yield_val: float = Field(..., alias="yield")
    predicted: float

    class Config:
        populate_by_name = True

class DashboardSummaryResponse(BaseModel):
    fab_health: float
    active_machines: int
    total_machines: int
    current_yield: float
    predicted_yield_24h: float
    warnings_count: int
    critical_count: int
    yield_trend: List[YieldTrendPoint]
    stage_throughput: List[Dict[str, Any]]
    latest_alerts: List[AlertResponse]
    process_status: List[Dict[str, Any]]

class FaultPredictResponse(BaseModel):
    anomaly_score: float
    risk_level: str
    fault_type: str
    confidence_score: float

class YieldPredictResponse(BaseModel):
    predicted_yield: float
    yield_loss_probability: float

class RulPredictResponse(BaseModel):
    failure_probability: float
    remaining_useful_life: float
    maintenance_urgency: str

class CSVUploadResponse(BaseModel):
    message: str
    records_inserted: int
    anomalies_detected: int


class MetricChartPoint(BaseModel):
    metric: str
    value: float


class RegressionChartPoint(BaseModel):
    index: int
    actual: float
    predicted: float


class FailureClassifierMetrics(BaseModel):
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    roc_auc: float
    chart: List[MetricChartPoint]


class RegressionMetrics(BaseModel):
    mae: float
    rmse: float
    r2: float
    chart: List[RegressionChartPoint]


class ModelPerformanceResponse(BaseModel):
    dataset_name: str
    dataset_records: int
    evaluated_at: str
    failure_classifier: FailureClassifierMetrics
    yield_model: RegressionMetrics
    rul_model: RegressionMetrics
