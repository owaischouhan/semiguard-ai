import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle, Factory, Gauge, ShieldCheck, TrendingUp, Zap,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, Panel, SeverityBadge } from "@/components/section";
import { DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchDashboardSummary } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";

export const Route = createFileRoute("/_app/")({
  component: ExecutiveDashboard,
});

function ExecutiveDashboard() {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: fetchDashboardSummary,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const syncLabel = dataUpdatedAt
    ? `LIVE · synced ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="Fab Command Center"
        title="Executive Dashboard"
        description="Loading model-driven fab intelligence…"
      />
    );
  }

  if (isError || !data) {
    return (
      <DashboardError
        eyebrow="Fab Command Center"
        title="Executive Dashboard"
        description="Real-time intelligence across all process stages."
        message={error instanceof Error ? error.message : "Failed to load dashboard summary."}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fab Command Center"
        title="Executive Dashboard"
        description="Real-time intelligence across all process stages — wafer prep through packaging."
        actions={
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className={`h-2 w-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} />
            {syncLabel}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard label="Fab Health" value={data.fab_health} decimals={1} suffix="%" icon={ShieldCheck} tone="success" hint="composite index" />
        <KpiCard label="Active Machines" value={data.active_machines} suffix={`/${data.total_machines}`} icon={Factory} tone="primary" />
        <KpiCard label="Current Yield" value={data.current_yield} decimals={1} suffix="%" icon={TrendingUp} tone="accent" />
        <KpiCard label="Predicted Yield (24h)" value={data.predicted_yield_24h} decimals={1} suffix="%" icon={Gauge} tone="primary" />
        <KpiCard label="Warnings" value={data.warnings_count} icon={AlertTriangle} tone="warning" />
        <KpiCard label="Critical Alerts" value={data.critical_count} icon={Zap} tone="destructive" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="Yield Trend — Actual vs Predicted" subtitle="7-day rolling window" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.yield_trend}>
              <defs>
                <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.78 0.17 220)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="oklch(0.78 0.17 220)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="g2" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.18 195)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.72 0.18 195)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
              <XAxis dataKey="day" stroke="oklch(0.7 0.03 230)" fontSize={11} />
              <YAxis domain={["auto", "auto"]} stroke="oklch(0.7 0.03 230)" fontSize={11} />
              <Tooltip contentStyle={{ background: "oklch(0.19 0.035 255)", border: "1px solid oklch(0.4 0.05 230 / 0.4)", borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="yield" stroke="oklch(0.78 0.17 220)" fill="url(#g1)" strokeWidth={2} />
              <Area type="monotone" dataKey="predicted" stroke="oklch(0.72 0.18 195)" fill="url(#g2)" strokeWidth={2} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Production Status" subtitle="Stage throughput (wafers/hr)">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.stage_throughput}>
              <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
              <XAxis dataKey="stage" stroke="oklch(0.7 0.03 230)" fontSize={10} />
              <YAxis stroke="oklch(0.7 0.03 230)" fontSize={11} />
              <Tooltip contentStyle={{ background: "oklch(0.19 0.035 255)", border: "1px solid oklch(0.4 0.05 230 / 0.4)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="wph" fill="oklch(0.72 0.18 195)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Latest Alerts" actions={<Link to="/fault-detection" className="text-xs text-primary hover:underline">View all →</Link>}>
          <div className="space-y-3">
            {data.latest_alerts.length === 0 && (
              <div className="text-sm text-muted-foreground">No active warnings or critical alerts.</div>
            )}
            {data.latest_alerts.map((alert) => (
              <motion.div key={alert.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-start gap-3 rounded-md border border-border bg-card/40 p-3">
                <div className={`mt-0.5 h-2 w-2 rounded-full ${alert.severity === "critical" ? "bg-destructive pulse-ring" : alert.severity === "warning" ? "bg-warning" : "bg-success"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{alert.id}</span>
                    <SeverityBadge severity={alert.severity} />
                    <span className="text-xs text-muted-foreground">{alert.machine_id}</span>
                  </div>
                  <div className="text-sm mt-1 text-foreground">{alert.type}</div>
                  <div className="text-xs text-muted-foreground truncate">{alert.description}</div>
                </div>
                <div className="text-right text-xs font-mono">
                  <div className="text-primary">{(alert.risk * 100).toFixed(0)}%</div>
                  <div className="text-muted-foreground">risk</div>
                </div>
              </motion.div>
            ))}
          </div>
        </Panel>

        <Panel title="Process Line Status" subtitle="Manufacturing flow">
          <div className="relative">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gradient-to-b from-primary via-accent to-transparent" />
            <ul className="space-y-3">
              {data.process_status.map((machine) => (
                <li key={machine.machineId} className="relative pl-8 flex items-center justify-between">
                  <span className={`absolute left-1.5 top-2 h-3 w-3 rounded-full border-2 ${machine.status === "critical" ? "border-destructive bg-destructive/30" : machine.status === "warning" ? "border-warning bg-warning/30" : "border-success bg-success/30"}`} />
                  <div>
                    <div className="text-sm font-medium">{machine.stage}</div>
                    <div className="text-xs text-muted-foreground font-mono">{machine.machineId} · {machine.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-foreground">{machine.health}%</div>
                    <SeverityBadge severity={machine.status} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
