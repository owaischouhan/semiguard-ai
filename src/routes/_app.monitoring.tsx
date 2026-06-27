import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { PageHeader, Panel } from "@/components/section";
import { DashboardEmpty, DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchSensorHistory } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";
import { Activity, Droplets, Gauge, Thermometer, Waves, Zap, CircleDot } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_app/monitoring")({
  component: Monitoring,
});

const SENSORS = [
  { key: "temperature", label: "Temperature", unit: "°C", icon: Thermometer, color: "oklch(0.78 0.17 75)" },
  { key: "pressure", label: "Pressure", unit: "atm", icon: Gauge, color: "oklch(0.78 0.17 220)" },
  { key: "humidity", label: "Humidity", unit: "%", icon: Droplets, color: "oklch(0.72 0.18 195)" },
  { key: "vibration", label: "Vibration", unit: "g", icon: Waves, color: "oklch(0.7 0.2 320)" },
  { key: "voltage", label: "Voltage", unit: "V", icon: Zap, color: "oklch(0.78 0.17 220)" },
  { key: "current", label: "Current", unit: "A", icon: Activity, color: "oklch(0.72 0.18 155)" },
  { key: "particles", label: "Particle Count", unit: "/L", icon: CircleDot, color: "oklch(0.65 0.24 22)" },
] as const;

const REFETCH_MS = 15_000;

function Monitoring() {
  const { data, isLoading, isError, error, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: dashboardKeys.sensorHistory(),
    queryFn: fetchSensorHistory,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
  });

  const syncLabel = dataUpdatedAt
    ? `LIVE · synced ${new Date(dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="Real-Time Monitoring Center"
        title="Live Sensor Telemetry"
        description="Loading sensor history from inference pipeline…"
      />
    );
  }

  if (isError) {
    return (
      <DashboardError
        eyebrow="Real-Time Monitoring Center"
        title="Live Sensor Telemetry"
        description="Process measurements from cleanroom equipment."
        message={error instanceof Error ? error.message : "Failed to load sensor history."}
        onRetry={() => refetch()}
      />
    );
  }

  if (!data?.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Real-Time Monitoring Center"
          title="Live Sensor Telemetry"
          description="Process measurements from uploaded telemetry or AI4I inference cache."
        />
        <DashboardEmpty message="No sensor readings available. Upload a dataset to populate telemetry." />
      </div>
    );
  }

  const latest = data[data.length - 1];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Real-Time Monitoring Center"
        title="Live Sensor Telemetry"
        description="Recent process measurements from model-analyzed sensor records."
        actions={
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className={`h-2 w-2 rounded-full bg-success ${isFetching ? "animate-pulse" : ""}`} />
            {syncLabel} · {data.length} points
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {SENSORS.map((s) => {
          const v = latest[s.key as keyof typeof latest] as number;
          const Icon = s.icon;
          return (
            <motion.div key={s.key} layout className="glass rounded-lg p-3 border border-border">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
                <Icon className="h-3.5 w-3.5" style={{ color: s.color }} />
              </div>
              <div className="mt-1 font-mono text-xl font-semibold text-glow" style={{ color: s.color }}>
                {v.toFixed(s.key === "particles" ? 0 : 2)}
                <span className="text-[10px] text-muted-foreground ml-1">{s.unit}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {SENSORS.map((s) => (
          <Panel key={s.key} title={`${s.label} — History`} subtitle={`Last ${data.length} readings · auto-refresh 15s`}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data}>
                <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
                <XAxis dataKey="t" hide />
                <YAxis stroke="oklch(0.7 0.03 230)" fontSize={10} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.19 0.035 255)",
                    border: "1px solid oklch(0.4 0.05 230 / 0.4)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => new Date(Number(t)).toLocaleTimeString()}
                />
                <Line type="monotone" dataKey={s.key} stroke={s.color} dot={false} strokeWidth={2} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        ))}
      </div>
    </div>
  );
}
