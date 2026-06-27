import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Panel, SeverityBadge } from "@/components/section";
import { DashboardEmpty, DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchEquipmentHealth, type Equipment } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/predictive-maintenance")({
  component: PredictiveMaintenance,
});

function maintenanceUrgency(machine: Equipment): string {
  if (machine.status === "critical" || machine.failure_prob > 0.7 || machine.rul < 100) return "critical";
  if (machine.status === "warning" || machine.failure_prob > 0.4 || machine.rul < 500) return "high";
  if (machine.failure_prob > 0.2 || machine.rul < 1000) return "medium";
  return "low";
}

function recommendationText(machine: Equipment): string {
  const urgency = maintenanceUrgency(machine);
  if (urgency === "critical") {
    return `${machine.name} shows critical degradation — failure probability ${(machine.failure_prob * 100).toFixed(0)}%, RUL ${machine.rul}h. Schedule immediate maintenance.`;
  }
  if (urgency === "high") {
    return `${machine.name} requires attention — health ${machine.health.toFixed(0)}%, anomaly score ${(machine.anomaly_score * 100).toFixed(0)}%. Plan maintenance within 48 hours.`;
  }
  if (urgency === "medium") {
    return `${machine.name} trending toward degradation — RUL ${machine.rul}h. Monitor closely and schedule preventive service.`;
  }
  return `${machine.name} operating within normal limits — health ${machine.health.toFixed(0)}%, RUL ${machine.rul}h. Continue routine monitoring.`;
}

function PredictiveMaintenance() {
  const { data: machines = [], isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: dashboardKeys.equipment(),
    queryFn: fetchEquipmentHealth,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="Predictive Maintenance"
        title="Equipment Health & RUL Forecasting"
        description="Loading equipment health from ML inference…"
      />
    );
  }

  if (isError) {
    return (
      <DashboardError
        eyebrow="Predictive Maintenance"
        title="Equipment Health & RUL Forecasting"
        description="Random Forest survival model predicts remaining useful life per machine."
        message={error instanceof Error ? error.message : "Failed to load equipment health."}
        onRetry={() => refetch()}
      />
    );
  }

  const sorted = [...machines].sort((a, b) => a.id.localeCompare(b.id));
  const recommendations = [...machines]
    .sort((a, b) => b.failure_prob - a.failure_prob || a.rul - b.rul)
    .slice(0, 6);

  const syncLabel = dataUpdatedAt
    ? `LIVE · synced ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Predictive Maintenance"
        title="Equipment Health & RUL Forecasting"
        description="Random Forest survival model predicts remaining useful life and failure probability per machine."
        actions={
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className={`h-2 w-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} />
            {syncLabel} · {machines.length} machines
          </div>
        }
      />

      {sorted.length === 0 ? (
        <DashboardEmpty message="No equipment health data available. Upload a dataset to run inference." />
      ) : (
        <div className="grid lg:grid-cols-3 gap-4">
          {sorted.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass rounded-xl p-5 border border-border"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono text-muted-foreground">
                    {m.id} · {m.stage}
                  </div>
                  <div className="font-medium mt-0.5">{m.name}</div>
                </div>
                <SeverityBadge severity={m.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric
                  label="Health"
                  value={`${m.health.toFixed(0)}%`}
                  tone={m.health > 80 ? "success" : m.health > 60 ? "warning" : "destructive"}
                />
                <Metric
                  label="Failure Prob"
                  value={`${(m.failure_prob * 100).toFixed(0)}%`}
                  tone={m.failure_prob > 0.5 ? "destructive" : m.failure_prob > 0.2 ? "warning" : "success"}
                />
                <Metric
                  label="RUL (hrs)"
                  value={m.rul.toLocaleString()}
                  tone={m.rul < 100 ? "destructive" : m.rul < 800 ? "warning" : "success"}
                />
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${m.health}%` }}
                  transition={{ duration: 1 }}
                  className={`h-full ${m.health > 80 ? "bg-success" : m.health > 60 ? "bg-warning" : "bg-destructive"}`}
                />
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Panel title="AI Maintenance Recommendations" subtitle="Ranked by failure probability from model inference">
        {recommendations.length === 0 ? (
          <DashboardEmpty message="No maintenance recommendations available." />
        ) : (
          <div className="space-y-3">
            {recommendations.map((m, i) => {
              const urgency = maintenanceUrgency(m);
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-4"
                >
                  <div className="h-9 w-9 grid place-items-center rounded-md bg-accent/15 text-accent border border-accent/30">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{m.id}</span>
                      <UrgencyBadge urgency={urgency} />
                    </div>
                    <p className="text-sm">{recommendationText(m)}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "destructive" }) {
  const c = { success: "text-success", warning: "text-warning", destructive: "text-destructive" } as const;
  return (
    <div className="rounded-md border border-border bg-card/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono font-semibold ${c[tone]}`}>{value}</div>
    </div>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, string> = {
    critical: "bg-destructive/15 text-destructive border-destructive/40",
    high: "bg-warning/15 text-warning border-warning/40",
    medium: "bg-primary/15 text-primary border-primary/40",
    low: "bg-success/15 text-success border-success/40",
  };
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono ${map[urgency] ?? map.low}`}>
      {urgency}
    </span>
  );
}
