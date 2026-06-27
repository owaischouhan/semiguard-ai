export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => [...dashboardKeys.all, "summary"] as const,
  equipment: () => [...dashboardKeys.all, "equipment"] as const,
  alerts: () => [...dashboardKeys.all, "alerts"] as const,
  sensorHistory: () => [...dashboardKeys.all, "sensor-history"] as const,
  yieldForecast: () => [...dashboardKeys.all, "yield-forecast"] as const,
  rootCause: (machineId?: string) => [...dashboardKeys.all, "root-cause", machineId ?? "default"] as const,
};

export const modelPerformanceKeys = {
  all: ["model-performance"] as const,
  metrics: () => [...modelPerformanceKeys.all, "metrics"] as const,
};
