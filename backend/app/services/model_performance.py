from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, List

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)

from ..ml.inference import load_models_safely
from ..ml.train import AI4I_FEATURES, load_ai4i_dataset

CHART_SAMPLE_SIZE = 80


def _round(value: float, decimals: int = 4) -> float:
    return round(float(value), decimals)


def _regression_chart(actual: np.ndarray, predicted: np.ndarray) -> List[Dict[str, float]]:
    indices = np.linspace(0, len(actual) - 1, min(CHART_SAMPLE_SIZE, len(actual)), dtype=int)
    chart: List[Dict[str, float]] = []
    for index in indices:
        chart.append(
            {
                "index": int(index + 1),
                "actual": _round(actual[index], 2),
                "predicted": _round(predicted[index], 2),
            }
        )
    return chart


@lru_cache(maxsize=1)
def compute_model_performance() -> Dict[str, Any]:
    """Evaluates saved models against the full AI4I 2020 dataset."""
    df = load_ai4i_dataset()
    _, rf_classifier, xgb_yield, rf_rul = load_models_safely()

    X = df[AI4I_FEATURES].to_numpy(dtype=float)
    y_failure = df["Machine failure"].to_numpy()
    y_yield = np.clip(
        98.0 - df["Tool wear [min]"] * 0.01 - df["Torque [Nm]"] * 0.03,
        0.0,
        100.0,
    ).astype(np.float64)
    y_rul = np.maximum(50.0, 2500.0 - df["Tool wear [min]"] * 8.0).astype(np.float64)

    failure_pred = rf_classifier.predict(X)
    failure_proba = rf_classifier.predict_proba(X)[:, 1]

    yield_pred = xgb_yield.predict(X)
    rul_pred = rf_rul.predict(X)

    failure_metrics = {
        "accuracy": _round(accuracy_score(y_failure, failure_pred)),
        "precision": _round(precision_score(y_failure, failure_pred, zero_division=0)),
        "recall": _round(recall_score(y_failure, failure_pred, zero_division=0)),
        "f1_score": _round(f1_score(y_failure, failure_pred, zero_division=0)),
        "roc_auc": _round(roc_auc_score(y_failure, failure_proba)),
    }

    yield_mae = mean_absolute_error(y_yield, yield_pred)
    yield_rmse = float(np.sqrt(mean_squared_error(y_yield, yield_pred)))
    yield_r2 = r2_score(y_yield, yield_pred)

    rul_mae = mean_absolute_error(y_rul, rul_pred)
    rul_rmse = float(np.sqrt(mean_squared_error(y_rul, rul_pred)))
    rul_r2 = r2_score(y_rul, rul_pred)

    return {
        "dataset_name": "AI4I 2020 Predictive Maintenance",
        "dataset_records": len(df),
        "evaluated_at": datetime.utcnow().isoformat(),
        "failure_classifier": {
            **failure_metrics,
            "chart": [
                {"metric": "Accuracy", "value": failure_metrics["accuracy"]},
                {"metric": "Precision", "value": failure_metrics["precision"]},
                {"metric": "Recall", "value": failure_metrics["recall"]},
                {"metric": "F1 Score", "value": failure_metrics["f1_score"]},
                {"metric": "ROC-AUC", "value": failure_metrics["roc_auc"]},
            ],
        },
        "yield_model": {
            "mae": _round(yield_mae, 3),
            "rmse": _round(yield_rmse, 3),
            "r2": _round(yield_r2),
            "chart": _regression_chart(y_yield, yield_pred),
        },
        "rul_model": {
            "mae": _round(rul_mae, 2),
            "rmse": _round(rul_rmse, 2),
            "r2": _round(rul_r2),
            "chart": _regression_chart(y_rul, rul_pred),
        },
    }


def get_model_performance() -> Dict[str, Any]:
    return compute_model_performance()
