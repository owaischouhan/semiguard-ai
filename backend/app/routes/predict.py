from fastapi import APIRouter, HTTPException
from ..models.schemas import SensorReadingBase, FaultPredictResponse, YieldPredictResponse, RulPredictResponse
from ..ml.inference import predict_all

router = APIRouter(prefix="", tags=["Inference"])

@router.post("/predict-fault", response_model=FaultPredictResponse)
def predict_fault_endpoint(reading: SensorReadingBase):
    """Evaluates Isolation Forest and Random Forest Classifier on telemetry data to classify faults."""
    try:
        # Convert schema to dict
        sensor_dict = reading.model_dump(by_alias=True)
        # Standardize 'yield' mapping if exists
        if "yield" not in sensor_dict:
            sensor_dict["yield"] = sensor_dict.get("yield_val")
        
        results = predict_all(sensor_dict)
        return {
            "anomaly_score": results["anomaly_score"],
            "risk_level": results["risk_level"],
            "fault_type": results["fault_type"],
            "confidence_score": results["fault_confidence"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Fault prediction inference failed: {e}")

@router.post("/predict-yield", response_model=YieldPredictResponse)
def predict_yield_endpoint(reading: SensorReadingBase):
    """Evaluates XGBoost regressor on cleanroom inputs to forecast wafer yield and yield loss probability."""
    try:
        sensor_dict = reading.model_dump(by_alias=True)
        if "yield" not in sensor_dict:
            sensor_dict["yield"] = sensor_dict.get("yield_val")
            
        results = predict_all(sensor_dict)
        return {
            "predicted_yield": results["predicted_yield"],
            "yield_loss_probability": results["yield_loss_probability"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Yield prediction inference failed: {e}")

@router.post("/predict-rul", response_model=RulPredictResponse)
def predict_rul_endpoint(reading: SensorReadingBase):
    """Evaluates the survival RUL regression model to calculate remaining equipment lifespan and maintenance urgency."""
    try:
        sensor_dict = reading.model_dump(by_alias=True)
        if "yield" not in sensor_dict:
            sensor_dict["yield"] = sensor_dict.get("yield_val")
            
        results = predict_all(sensor_dict)
        return {
            "failure_probability": results["failure_probability"],
            "remaining_useful_life": results["predicted_rul"],
            "maintenance_urgency": results["maintenance_urgency"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RUL prediction inference failed: {e}")
