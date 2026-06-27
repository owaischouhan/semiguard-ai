import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { PageHeader, Panel, SeverityBadge } from "@/components/section";
import { DashboardEmpty, DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchEquipmentHealth, type Equipment } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";

export const Route = createFileRoute("/_app/fab-map")({
  component: FabMap,
});

function statusStyles(status: Equipment["status"]) {
  switch (status) {
    case "critical":
      return {
        dot: "bg-destructive pulse-ring",
        bar: "bg-destructive",
        ring: "ring-destructive/40",
        label: "Critical",
      };
    case "warning":
      return {
        dot: "bg-warning",
        bar: "bg-warning",
        ring: "ring-warning/40",
        label: "Warning",
      };
    default:
      return {
        dot: "bg-success",
        bar: "bg-success",
        ring: "ring-success/40",
        label: "Healthy",
      };
  }
}

function MachineTile({ machine, index }: { machine: Equipment; index: number }) {
  const styles = statusStyles(machine.status);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className={`relative rounded-md glass border border-border p-2 hover:border-primary/60 transition-colors ring-1 ${styles.ring}`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">{machine.id}</span>
        <span className={`h-2 w-2 rounded-full ${styles.dot}`} title={styles.label} />
      </div>
      <div className="text-xs font-medium mt-1 truncate">{machine.stage}</div>
      <div className="text-[10px] text-muted-foreground truncate">{machine.name}</div>
      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${styles.bar}`} style={{ width: `${machine.health}%` }} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] font-mono text-muted-foreground">
        <span>Health {machine.health.toFixed(0)}%</span>
        <span>RUL {machine.rul}h</span>
        <span>Anomaly {(machine.anomaly_score * 100).toFixed(0)}%</span>
        <span>Fail {(machine.failure_prob * 100).toFixed(0)}%</span>
      </div>
    </motion.div>
  );
}

function FabMap() {
  const { data: machines = [], isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: dashboardKeys.equipment(),
    queryFn: fetchEquipmentHealth,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const sortedMachines = [...machines].sort((a, b) => a.id.localeCompare(b.id));

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="Digital Twin"
        title="Interactive Fab Floor Map"
        description="Loading equipment health from inference pipeline…"
      />
    );
  }

  if (isError) {
    return (
      <DashboardError
        eyebrow="Digital Twin"
        title="Interactive Fab Floor Map"
        description="Live equipment health from ML predictions."
        message={error instanceof Error ? error.message : "Failed to load equipment health."}
        onRetry={() => refetch()}
      />
    );
  }

  const syncLabel = dataUpdatedAt
    ? `LIVE · synced ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Digital Twin"
        title="Interactive Fab Floor Map"
        description="Live equipment health derived from anomaly scores, failure probability, and RUL predictions."
        actions={
          <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground">
            <span className={`h-2 w-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} />
            {syncLabel} · {machines.length} machines
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 text-xs">
        <LegendSwatch color="bg-success" label="Healthy" />
        <LegendSwatch color="bg-warning" label="Warning" />
        <LegendSwatch color="bg-destructive" label="Critical" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Cleanroom Floor — FAB-A" className="lg:col-span-2">
          {sortedMachines.length === 0 ? (
            <DashboardEmpty message="No equipment data available. Upload a dataset to populate the fab map." />
          ) : (
            <div className="relative aspect-[16/10] rounded-lg border border-border bg-gradient-to-br from-card/60 to-card/20 overflow-hidden grid-bg scan-line">
              <svg className="absolute right-6 top-6 h-32 w-32 opacity-30" viewBox="0 0 100 100">
                <defs>
                  <radialGradient id="wafer" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="oklch(0.85 0.18 200)" />
                    <stop offset="100%" stopColor="oklch(0.78 0.17 220 / 0.1)" />
                  </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="48" fill="url(#wafer)" />
                <circle cx="50" cy="50" r="48" fill="none" stroke="oklch(0.85 0.18 200)" strokeWidth="0.5" />
                {Array.from({ length: 8 }).map((_, i) => (
                  <circle
                    key={i}
                    cx="50"
                    cy="50"
                    r={6 + i * 5}
                    fill="none"
                    stroke="oklch(0.78 0.17 220)"
                    strokeWidth="0.2"
                    opacity={0.5}
                  />
                ))}
              </svg>

              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-3 p-6">
                {sortedMachines.map((machine, index) => (
                  <MachineTile key={machine.id} machine={machine} index={index} />
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Stage Index" subtitle="Health status by process stage">
          {sortedMachines.length === 0 ? (
            <DashboardEmpty message="No machines to display." />
          ) : (
            <ul className="space-y-2 text-sm">
              {sortedMachines.map((machine, index) => (
                <li
                  key={machine.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card/40 p-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground w-6">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate">{machine.stage}</div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {machine.id} · {machine.health.toFixed(0)}% · RUL {machine.rul}h
                      </div>
                    </div>
                  </div>
                  <SeverityBadge severity={machine.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card/40 px-2.5 py-1">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
