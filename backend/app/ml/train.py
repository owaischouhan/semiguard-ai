import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest, RandomForestClassifier, RandomForestRegressor
from xgboost import XGBRegressor

# Create models folder
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

AI4I_FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]"
]

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATASET_CANDIDATES = [
    os.path.join(REPO_ROOT, "datasets", "ai4i2020.csv"),
    os.path.join(REPO_ROOT, "ai4i2020.csv")
]


def resolve_dataset_path() -> str:
    for path in DATASET_CANDIDATES:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(
        "AI4I dataset not found. Expected datasets/ai4i2020.csv or ai4i2020.csv at repo root."
    )


def load_ai4i_dataset() -> pd.DataFrame:
    dataset_path = resolve_dataset_path()
    print(f"Loading AI4I dataset from {dataset_path}")
    df = pd.read_csv(dataset_path)
    required_columns = [*AI4I_FEATURES, "Machine failure"]
    missing_columns = [c for c in required_columns if c not in df.columns]
    if missing_columns:
        raise ValueError(f"Dataset missing required columns: {missing_columns}")
    return df


def train_models():
    """Trains all ML models using the real AI4I 2020 dataset and saves them."""
    df = load_ai4i_dataset()
    print(f"Training dataset loaded: {len(df)} records")

    X = df[AI4I_FEATURES]
    y_failure = df["Machine failure"]
    y_rul = np.maximum(50, 2500 - df["Tool wear [min]"] * 8).astype(np.float64)
    y_yield = np.clip(
        98 - df["Tool wear [min]"] * 0.01 - df["Torque [Nm]"] * 0.03,
        0.0,
        100.0
    ).astype(np.float64)

    print("Training Isolation Forest Anomaly Detection...")
    iso_forest = IsolationForest(contamination=0.05, random_state=42)
    iso_forest.fit(X.to_numpy())
    joblib.dump(iso_forest, os.path.join(MODELS_DIR, "isolation_forest.joblib"))

    print("Training Random Forest Failure Classifier...")
    rf_classifier = RandomForestClassifier(
        n_estimators=120,
        max_depth=10,
        class_weight="balanced",
        random_state=42
    )
    rf_classifier.fit(X.to_numpy(), y_failure)
    joblib.dump(rf_classifier, os.path.join(MODELS_DIR, "random_forest_classifier.joblib"))

    print("Training XGBoost Yield Regressor...")
    xgb_regressor = XGBRegressor(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.08,
        random_state=42,
        verbosity=0
    )
    xgb_regressor.fit(X.to_numpy(), y_yield)
    joblib.dump(xgb_regressor, os.path.join(MODELS_DIR, "xgboost_yield_regressor.joblib"))

    print("Training RUL Regressor...")
    rf_rul = RandomForestRegressor(
        n_estimators=120,
        max_depth=10,
        random_state=42
    )
    rf_rul.fit(X.to_numpy(), y_rul)
    joblib.dump(rf_rul, os.path.join(MODELS_DIR, "random_forest_rul.joblib"))

    print("All models trained and saved to backend/app/ml/models/ successfully!")


if __name__ == "__main__":
    train_models()
