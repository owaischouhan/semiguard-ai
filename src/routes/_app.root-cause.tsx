import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, Panel, SeverityBadge } from "@/components/section";
import { DashboardEmpty, DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchEquipmentHealth, fetchRootCause } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";
import { motion } from "framer-motion";
import { Brain, Lightbulb } from "lucide-react";

export const Route = createFileRoute("/_app/root-cause")({
  component: RootCause,
});

function RootCause() {
  const [selectedMachineId, setSelectedMachineId] = useState<string | undefined>(undefined);

  const equipmentQuery = useQuery({
    queryKey: dashboardKeys.equipment(),
    queryFn: fetchEquipmentHealth,
    refetchOnWindowFocus: true,
  });

  const rootCauseQuery = useQuery({
    queryKey: dashboardKeys.rootCause(selectedMachineId),
    queryFn: () => fetchRootCause(selectedMachineId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const isLoading = equipmentQuery.isLoading || rootCauseQuery.isLoading;
  const isError = rootCauseQuery.isError;
  const error = rootCauseQuery.error;

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="Root Cause Analysis"
        title="Explainable AI Diagnostics"
        description="Loading feature attribution from inference pipeline…"
      />
    );
  }

  if (isError) {
    return (
      <DashboardError
        eyebrow="Root Cause Analysis"
        title="Explainable AI Diagnostics"
        description="Feature attribution explaining model predictions."
        message={error instanceof Error ? error.message : "Failed to load root cause diagnostics."}
        onRetry={() => rootCauseQuery.refetch()}
      />
    );
  }

  const data = rootCauseQuery.data;
  const machines = equipmentQuery.data ?? [];
  const machine = machines.find((m) => m.id === data?.machine_id);

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Root Cause Analysis"
          title="Explainable AI Diagnostics"
          description="Feature attribution explaining model predictions and ranking contributing factors."
        />
        <DashboardEmpty message="No root cause diagnostics available. Upload telemetry to run inference." />
      </div>
    );
  }

  const syncLabel = rootCauseQuery.dataUpdatedAt
    ? `LIVE · synced ${new Date(rootCauseQuery.dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Root Cause Analysis"
        title="Explainable AI Diagnostics"
        description="Feature attribution explaining model predictions and ranking contributing factors."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedMachineId ?? ""}
              onChange={(e) => setSelectedMachineId(e.target.value || undefined)}
              className="rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-foreground"
            >
              <option value="">Highest risk (auto)</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span className={`h-2 w-2 rounded-full bg-success ${rootCauseQuery.isFetching ? "animate-pulse" : ""}`} />
              {syncLabel}
            </div>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Selected Anomaly" className="lg:col-span-1">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{data.machine_id}</span>
              <SeverityBadge severity={data.risk_level} />
            </div>
            <div>
              <div className="text-lg font-semibold">{data.fault_type}</div>
              <div className="text-sm text-muted-foreground">
                {machine?.name ?? data.machine_id} · {machine?.stage ?? "—"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border bg-card/40 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Anomaly Score</div>
                <div className="font-mono text-destructive font-semibold">{(data.anomaly_score * 100).toFixed(0)}%</div>
              </div>
              <div className="rounded-md border border-border bg-card/40 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Confidence</div>
                <div className="font-mono text-primary font-semibold">{(data.confidence_score * 100).toFixed(0)}%</div>
              </div>
              <div className="rounded-md border border-border bg-card/40 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">Predicted Yield</div>
                <div className="font-mono font-semibold">{data.predicted_yield.toFixed(1)}%</div>
              </div>
              <div className="rounded-md border border-border bg-card/40 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">RUL</div>
                <div className="font-mono font-semibold">{Math.round(data.predicted_rul)}h</div>
              </div>
            </div>
            <div className="rounded-md border border-border bg-card/40 p-2 text-xs">
              <span className="text-muted-foreground">Maintenance urgency: </span>
              <span className="font-mono uppercase">{data.maintenance_urgency}</span>
            </div>
          </div>
        </Panel>

        <Panel title="Feature Contribution" subtitle="Model feature importance ranking" className="lg:col-span-2">
          {data.shap_values.length === 0 ? (
            <DashboardEmpty message="No feature attributions available for this machine." />
          ) : (
            <div className="space-y-3">
              {data.shap_values.map((f, i) => (
                <motion.div
                  key={f.name}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{f.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{(f.importance * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(f.importance * 100 * 2.5, 100)}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className="h-full rounded-full bg-gradient-to-r from-primary via-accent to-primary glow-primary"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title="AI Recommendations" subtitle="Generated by SemiGuard reasoning engine">
        {data.recommendations.length === 0 ? (
          <DashboardEmpty message="No recommendations available for this machine." />
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {data.recommendations.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3"
              >
                <Lightbulb className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                <p className="text-sm">{r}</p>
              </motion.div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
