from fastapi import APIRouter, HTTPException

from ..models.schemas import ModelPerformanceResponse
from ..services.model_performance import get_model_performance

router = APIRouter(prefix="", tags=["Model Performance"])


@router.get("/model-performance", response_model=ModelPerformanceResponse)
def get_model_performance_endpoint():
    """Returns evaluation metrics for all ML models on the AI4I 2020 dataset."""
    try:
        return get_model_performance()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute model performance: {e}")
