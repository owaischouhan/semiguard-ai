import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple, Optional, List

# Paths to models
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
ISO_FOREST_PATH = os.path.join(MODELS_DIR, "isolation_forest.joblib")
RF_CLASSIFIER_PATH = os.path.join(MODELS_DIR, "random_forest_classifier.joblib")
XGB_YIELD_PATH = os.path.join(MODELS_DIR, "xgboost_yield_regressor.joblib")
RF_RUL_PATH = os.path.join(MODELS_DIR, "random_forest_rul.joblib")

AI4I_FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]"
]

FRONTEND_TO_AI4I_MAP = {
    "temperature": "Air temperature [K]",
    "pressure": "Process temperature [K]",
    "vibration": "Rotational speed [rpm]",
    "current": "Torque [Nm]",
    "particles": "Tool wear [min]"
}

BASELINES = {
    "Air temperature [K]": {"mean": 298.5, "std": 0.3, "label": "Air temperature [K]"},
    "Process temperature [K]": {"mean": 308.8, "std": 0.4, "label": "Process temperature [K]"},
    "Rotational speed [rpm]": {"mean": 1500.0, "std": 300.0, "label": "Rotational speed [rpm]"},
    "Torque [Nm]": {"mean": 40.0, "std": 10.0, "label": "Torque [Nm]"},
    "Tool wear [min]": {"mean": 30.0, "std": 15.0, "label": "Tool wear [min]"}
}

FAULT_CLASSES = [
    "Normal Operation",
    "Machine Failure"
]

_MODEL_CACHE: Optional[Tuple[Any, Any, Any, Any]] = None


def load_models_safely() -> Tuple[Any, Any, Any, Any]:
    """Loads all models, automatically training them if they do not exist."""
    global _MODEL_CACHE
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE

    if not (os.path.exists(ISO_FOREST_PATH) and
            os.path.exists(RF_CLASSIFIER_PATH) and
            os.path.exists(XGB_YIELD_PATH) and
            os.path.exists(RF_RUL_PATH)):
        print("ML Model binaries not found. Triggering automated model training...")
        from .train import train_models
        train_models()

    iso_forest = joblib.load(ISO_FOREST_PATH)
    rf_classifier = joblib.load(RF_CLASSIFIER_PATH)
    xgb_yield = joblib.load(XGB_YIELD_PATH)
    rf_rul = joblib.load(RF_RUL_PATH)

    _MODEL_CACHE = (iso_forest, rf_classifier, xgb_yield, rf_rul)
    return _MODEL_CACHE


def map_frontend_to_ai4i(sensor_data: Dict[str, float]) -> Dict[str, float]:
    """Maps frontend telemetry fields to AI4I feature names."""
    missing_fields = [key for key in FRONTEND_TO_AI4I_MAP if key not in sensor_data]
    if missing_fields:
        raise KeyError(f"Missing required frontend fields for AI4I mapping: {missing_fields}")

    return {
        ai4i_name: float(sensor_data[frontend_name])
        for frontend_name, ai4i_name in FRONTEND_TO_AI4I_MAP.items()
    }


def _compute_model_outputs(X: np.ndarray) -> Dict[str, np.ndarray]:
    """Runs vectorized inference for one or many AI4I feature rows."""
    iso_forest, rf_classifier, xgb_yield, rf_rul = load_models_safely()

    dec_scores = iso_forest.decision_function(X)
    anomaly_scores = 1.0 / (1.0 + np.exp(5.0 * dec_scores))

    fault_probs = rf_classifier.predict_proba(X)
    pred_class_idx = np.argmax(fault_probs, axis=1)
    fault_confidences = fault_probs[np.arange(len(fault_probs)), pred_class_idx]

    predicted_yields = np.clip(xgb_yield.predict(X), 0.0, 100.0)
    yield_loss_probabilities = np.clip((98.0 - predicted_yields) / 10.0, 0.0, 1.0)

    predicted_ruls = rf_rul.predict(X)
    failure_probabilities = np.clip((2500.0 - predicted_ruls) / 2500.0, 0.05, 0.95)

    return {
        "anomaly_scores": anomaly_scores,
        "pred_class_idx": pred_class_idx,
        "fault_confidences": fault_confidences,
        "predicted_yields": predicted_yields,
        "yield_loss_probabilities": yield_loss_probabilities,
        "predicted_ruls": predicted_ruls,
        "failure_probabilities": failure_probabilities,
    }


def _risk_level_from_anomaly(anomaly_score: float) -> str:
    if anomaly_score > 0.75:
        return "critical"
    if anomaly_score > 0.45:
        return "warning"
    return "normal"


def _maintenance_urgency_from_rul(predicted_rul: float, failure_probability: float) -> str:
    if predicted_rul < 100 or failure_probability > 0.8:
        return "critical"
    if predicted_rul < 500 or failure_probability > 0.5:
        return "high"
    if predicted_rul < 1000 or failure_probability > 0.2:
        return "medium"
    return "low"


def _assemble_inference_result(
    sensor_data: Dict[str, float],
    anomaly_score: float,
    pred_class_idx: int,
    fault_confidence: float,
    predicted_yield: float,
    yield_loss_probability: float,
    predicted_rul: float,
    failure_probability: float,
    include_explain: bool = True,
) -> Dict[str, Any]:
    explain_data = (
        explain_root_cause(sensor_data)
        if include_explain
        else {"shap_values": [], "recommendations": []}
    )

    return {
        "anomaly_score": float(anomaly_score),
        "risk_level": _risk_level_from_anomaly(float(anomaly_score)),
        "fault_type": FAULT_CLASSES[int(pred_class_idx)],
        "fault_confidence": float(fault_confidence),
        "predicted_yield": float(predicted_yield),
        "yield_loss_probability": float(yield_loss_probability),
        "predicted_rul": float(predicted_rul),
        "failure_probability": float(failure_probability),
        "maintenance_urgency": _maintenance_urgency_from_rul(
            float(predicted_rul),
            float(failure_probability),
        ),
        "shap_values": explain_data["shap_values"],
        "recommendations": explain_data["recommendations"],
    }


def predict_all(sensor_data: Dict[str, float]) -> Dict[str, Any]:
    """Runs concurrent inference through all 4 ML models for a single sensor reading."""
    internal_features = map_frontend_to_ai4i(sensor_data)
    X = np.array([[internal_features[feature] for feature in AI4I_FEATURES]], dtype=float)
    outputs = _compute_model_outputs(X)

    return _assemble_inference_result(
        sensor_data=sensor_data,
        anomaly_score=float(outputs["anomaly_scores"][0]),
        pred_class_idx=int(outputs["pred_class_idx"][0]),
        fault_confidence=float(outputs["fault_confidences"][0]),
        predicted_yield=float(outputs["predicted_yields"][0]),
        yield_loss_probability=float(outputs["yield_loss_probabilities"][0]),
        predicted_rul=float(outputs["predicted_ruls"][0]),
        failure_probability=float(outputs["failure_probabilities"][0]),
        include_explain=True,
    )


def predict_all_batch(
    sensor_data_list: List[Dict[str, float]],
    include_explain_for: Optional[set[int]] = None,
) -> List[Dict[str, Any]]:
    """Runs the same inference pipeline as predict_all() across many sensor readings."""
    if not sensor_data_list:
        return []

    X = np.array(
        [
            [map_frontend_to_ai4i(sensor_data)[feature] for feature in AI4I_FEATURES]
            for sensor_data in sensor_data_list
        ],
        dtype=float,
    )
    outputs = _compute_model_outputs(X)
    explain_indices = include_explain_for or set()

    results: List[Dict[str, Any]] = []
    for index, sensor_data in enumerate(sensor_data_list):
        results.append(
            _assemble_inference_result(
                sensor_data=sensor_data,
                anomaly_score=float(outputs["anomaly_scores"][index]),
                pred_class_idx=int(outputs["pred_class_idx"][index]),
                fault_confidence=float(outputs["fault_confidences"][index]),
                predicted_yield=float(outputs["predicted_yields"][index]),
                yield_loss_probability=float(outputs["yield_loss_probabilities"][index]),
                predicted_rul=float(outputs["predicted_ruls"][index]),
                failure_probability=float(outputs["failure_probabilities"][index]),
                include_explain=index in explain_indices,
            )
        )

    return results


def explain_root_cause(sensor_data: Dict[str, float]) -> Dict[str, Any]:
    """Approximates SHAP feature attributions based on AI4I feature deviations."""
    internal_features = map_frontend_to_ai4i(sensor_data)
    importances = {
        "Air temperature [K]": 0.20,
        "Process temperature [K]": 0.24,
        "Rotational speed [rpm]": 0.22,
        "Torque [Nm]": 0.18,
        "Tool wear [min]": 0.16
    }

    deviations = {}
    for feature, params in BASELINES.items():
        value = internal_features[feature]
        z_score = np.abs((value - params["mean"]) / params["std"])
        deviations[feature] = z_score * importances[feature]

    total_dev = sum(deviations.values())
    if total_dev == 0:
        total_dev = 1e-6

    shap_contributions = [
        {
            "name": BASELINES[feature]["label"],
            "importance": float(score / total_dev)
        }
        for feature, score in deviations.items()
    ]

    shap_contributions.sort(key=lambda item: item["importance"], reverse=True)

    recommendations = []
    if internal_features["Air temperature [K]"] > 310:
        recommendations.append("Air temperature is elevated. Inspect thermal control and coolant flow.")
    if internal_features["Process temperature [K]"] > 320:
        recommendations.append("Process temperature is high. Verify process heating and cooling setpoints.")
    if internal_features["Tool wear [min]"] > 30:
        recommendations.append("Tool wear is high. Replace the tool or schedule preventive maintenance.")
    if internal_features["Rotational speed [rpm]"] > 1800:
        recommendations.append("Rotational speed is above normal. Check spindle load and speed control.")
    if internal_features["Torque [Nm]"] > 60:
        recommendations.append("Torque is elevated. Inspect drive train and mechanical load.")

    if not recommendations:
        recommendations.append("Process parameters are within expected AI4I ranges.")
        recommendations.append("Continue normal monitoring and schedule routine inspection.")

    return {
        "shap_values": shap_contributions,
        "recommendations": recommendations
    }
