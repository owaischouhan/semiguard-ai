import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Panel, SeverityBadge } from "@/components/section";
import { DashboardEmpty, DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchAlerts, fetchEquipmentHealth } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";
import { motion } from "framer-motion";
import { AlertTriangle, Brain, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_app/fault-detection")({
  component: FaultDetection,
});

function FaultDetection() {
  const alertsQuery = useQuery({
    queryKey: dashboardKeys.alerts(),
    queryFn: fetchAlerts,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const equipmentQuery = useQuery({
    queryKey: dashboardKeys.equipment(),
    queryFn: fetchEquipmentHealth,
    refetchOnWindowFocus: true,
  });

  const { data: alerts, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = alertsQuery;
  const equipment = equipmentQuery.data ?? [];
  const equipmentById = Object.fromEntries(equipment.map((m) => [m.id, m]));

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="AI Fault Detection Center"
        title="Anomaly & Fault Intelligence"
        description="Loading model-detected anomalies…"
      />
    );
  }

  if (isError) {
    return (
      <DashboardError
        eyebrow="AI Fault Detection Center"
        title="Anomaly & Fault Intelligence"
        description="Isolation Forest + ensemble fault classification."
        message={error instanceof Error ? error.message : "Failed to load alerts."}
        onRetry={() => refetch()}
      />
    );
  }

  const list = alerts ?? [];
  const total = list.length;
  const critical = list.filter((a) => a.severity === "critical").length;
  const warning = list.filter((a) => a.severity === "warning").length;
  const avgConfidence = total > 0 ? Math.round((list.reduce((sum, a) => sum + a.confidence, 0) / total) * 100) : 0;

  const syncLabel = dataUpdatedAt
    ? `LIVE · synced ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI Fault Detection Center"
        title="Anomaly & Fault Intelligence"
        description="Isolation Forest + XGBoost ensemble monitoring sensor streams for drift, contamination & sensor failures."
        actions={
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className={`h-2 w-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} />
            {syncLabel}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={Brain} label="Detected" value={total} tone="primary" />
        <Stat icon={AlertTriangle} label="Warnings" value={warning} tone="warning" />
        <Stat icon={ShieldAlert} label="Critical" value={critical} tone="destructive" />
        <Stat icon={Brain} label="Avg Confidence" value={`${avgConfidence}%`} tone="accent" />
      </div>

      <Panel title="Anomaly Stream" subtitle="Model-classified faults from inference pipeline">
        {list.length === 0 ? (
          <DashboardEmpty message="No active anomalies detected. Upload telemetry or wait for model inference to complete." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Machine</th>
                  <th className="py-2 pr-4">Fault Type</th>
                  <th className="py-2 pr-4">Severity</th>
                  <th className="py-2 pr-4">Risk</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2 pr-4">Detected</th>
                </tr>
              </thead>
              <tbody>
                {list.map((a, i) => {
                  const machine = equipmentById[a.machine_id];
                  return (
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="border-b border-border/40 hover:bg-card/40"
                    >
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{a.id}</td>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{a.machine_id}</div>
                        <div className="text-xs text-muted-foreground">{machine?.stage ?? "—"}</div>
                      </td>
                      <td className="py-3 pr-4">
                        {a.type}
                        <div className="text-xs text-muted-foreground max-w-md truncate">{a.description}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <SeverityBadge severity={a.severity} />
                      </td>
                      <td className="py-3 pr-4">
                        <RiskBar value={a.risk} />
                      </td>
                      <td className="py-3 pr-4 font-mono">{(a.confidence * 100).toFixed(0)}%</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {new Date(a.timestamp).toLocaleString()}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: "primary" | "warning" | "destructive" | "accent";
}) {
  const map = {
    primary: "text-primary border-primary/30",
    warning: "text-warning border-warning/30",
    destructive: "text-destructive border-destructive/30",
    accent: "text-accent border-accent/30",
  } as const;
  return (
    <div className={`glass rounded-xl p-4 border ${map[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${map[tone]}`} />
      </div>
      <div className={`mt-2 text-2xl font-semibold font-mono ${map[tone]} text-glow`}>{value}</div>
    </div>
  );
}

function RiskBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct > 75 ? "bg-destructive" : pct > 45 ? "bg-warning" : "bg-success";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8 }} className={`h-full ${color}`} />
      </div>
      <span className="font-mono text-xs text-foreground">{pct}%</span>
    </div>
  );
}
