import { API_BASE_URL } from "./api-config";

export interface DashboardSummary {
  fab_health: number;
  active_machines: number;
  total_machines: number;
  current_yield: number;
  predicted_yield_24h: number;
  warnings_count: number;
  critical_count: number;
  yield_trend: { day: string; yield: number; predicted: number }[];
  stage_throughput: { stage: string; wph: number }[];
  latest_alerts: Alert[];
  process_status: { stage: string; machineId: string; name: string; health: number; status: "normal" | "warning" | "critical" }[];
}

export interface Equipment {
  id: string;
  name: string;
  stage: string;
  status: "normal" | "warning" | "critical";
  health: number;
  anomaly_score: number;
  rul: number;
  failure_prob: number;
}

export interface Alert {
  id: string;
  machine_id: string;
  type: string;
  severity: "normal" | "warning" | "critical";
  risk: number;
  confidence: number;
  timestamp: string;
  description: string;
  resolved: boolean;
}

export interface SensorReading {
  t: number;
  temperature: number;
  pressure: number;
  humidity: number;
  vibration: number;
  particles: number;
  voltage: number;
  current: number;
  yield: number;
}

export interface YieldForecastPoint {
  h: string;
  expected: number;
  risk: number;
}

export interface RootCauseData {
  machine_id: string;
  anomaly_score: number;
  risk_level: "normal" | "warning" | "critical";
  fault_type: string;
  confidence_score: number;
  predicted_yield: number;
  predicted_rul: number;
  failure_probability: number;
  maintenance_urgency: "low" | "medium" | "high" | "critical";
  shap_values: { name: string; importance: number }[];
  recommendations: string[];
}

export interface SystemStatus {
  backend: "online" | "offline";
  database: "sqlite" | "postgres" | "unknown";
  models_loaded: number;
  dataset_name: string;
  dataset_records: number;
  api_status: "healthy" | "degraded" | "down";
  last_sync: string;
  app_version: string;
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE_URL}/status`);
  if (!res.ok) throw new Error("Failed to fetch system status");
  return res.json();
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${API_BASE_URL}/dashboard-summary`);
  if (!res.ok) throw new Error("Failed to fetch dashboard summary");
  return res.json();
}

export async function fetchEquipmentHealth(): Promise<Equipment[]> {
  const res = await fetch(`${API_BASE_URL}/equipment-health`);
  if (!res.ok) throw new Error("Failed to fetch equipment health");
  return res.json();
}

export async function fetchAlerts(): Promise<Alert[]> {
  const res = await fetch(`${API_BASE_URL}/alerts`);
  if (!res.ok) throw new Error("Failed to fetch alerts");
  return res.json();
}

export async function fetchSensorHistory(): Promise<SensorReading[]> {
  const res = await fetch(`${API_BASE_URL}/sensor-history`);
  if (!res.ok) throw new Error("Failed to fetch sensor history");
  return res.json();
}

export async function fetchYieldForecast(): Promise<YieldForecastPoint[]> {
  const res = await fetch(`${API_BASE_URL}/yield-forecast`);
  if (!res.ok) throw new Error("Failed to fetch yield forecast");
  return res.json();
}

export async function fetchRootCause(machineId?: string): Promise<RootCauseData> {
  const url = machineId ? `${API_BASE_URL}/root-cause?machine_id=${machineId}` : `${API_BASE_URL}/root-cause`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch root cause diagnostics");
  return res.json();
}

export async function uploadCSV(file: File): Promise<{ message: string; records_inserted: number; anomalies_detected: number }> {
  const formData = new FormData();
  formData.append("file", file);
  
  const res = await fetch(`${API_BASE_URL}/upload-data`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ detail: "Failed to upload CSV file" }));
    throw new Error(errData.detail || "Failed to upload CSV file");
  }
  return res.json();
}

export interface ModelPerformance {
  dataset_name: string;
  dataset_records: number;
  evaluated_at: string;
  failure_classifier: {
    accuracy: number;
    precision: number;
    recall: number;
    f1_score: number;
    roc_auc: number;
    chart: { metric: string; value: number }[];
  };
  yield_model: {
    mae: number;
    rmse: number;
    r2: number;
    chart: { index: number; actual: number; predicted: number }[];
  };
  rul_model: {
    mae: number;
    rmse: number;
    r2: number;
    chart: { index: number; actual: number; predicted: number }[];
  };
}

export async function fetchModelPerformance(): Promise<ModelPerformance> {
  const res = await fetch(`${API_BASE_URL}/model-performance`);
  if (!res.ok) throw new Error("Failed to fetch model performance metrics");
  return res.json();
}

export const PDF_EXPORT_URL = `${API_BASE_URL}/export-pdf`;
