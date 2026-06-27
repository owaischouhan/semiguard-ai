import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, Panel } from "@/components/section";
import { DashboardEmpty, DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchDashboardSummary, fetchYieldForecast } from "@/lib/api";
import { dashboardKeys } from "@/lib/queries";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { TrendingUp, Target, AlertTriangle, Percent } from "lucide-react";

export const Route = createFileRoute("/_app/yield")({
  component: YieldPage,
});

const tooltipStyle = {
  background: "oklch(0.19 0.035 255)",
  border: "1px solid oklch(0.4 0.05 230 / 0.4)",
  borderRadius: 8,
  fontSize: 12,
};

function YieldPage() {
  const forecastQuery = useQuery({
    queryKey: dashboardKeys.yieldForecast(),
    queryFn: fetchYieldForecast,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const summaryQuery = useQuery({
    queryKey: dashboardKeys.summary(),
    queryFn: fetchDashboardSummary,
    refetchOnWindowFocus: true,
  });

  const isLoading = forecastQuery.isLoading || summaryQuery.isLoading;
  const isError = forecastQuery.isError || summaryQuery.isError;
  const error = forecastQuery.error ?? summaryQuery.error;

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="Yield Prediction Center"
        title="Wafer Yield Forecasting"
        description="Loading yield forecast from XGBoost regression…"
      />
    );
  }

  if (isError) {
    return (
      <DashboardError
        eyebrow="Yield Prediction Center"
        title="Wafer Yield Forecasting"
        description="XGBoost regression forecasts yield and loss risk."
        message={error instanceof Error ? error.message : "Failed to load yield data."}
        onRetry={() => {
          forecastQuery.refetch();
          summaryQuery.refetch();
        }}
      />
    );
  }

  const forecast = forecastQuery.data ?? [];
  const summary = summaryQuery.data;

  const expectedYield24h =
    forecast.length > 0
      ? forecast.reduce((sum, p) => sum + p.expected, 0) / forecast.length
      : summary?.predicted_yield_24h ?? 0;

  const avgRisk =
    forecast.length > 0 ? forecast.reduce((sum, p) => sum + p.risk, 0) / forecast.length : 0;

  const maxRisk = forecast.length > 0 ? Math.max(...forecast.map((p) => p.risk)) : 0;

  const yieldTrend =
    summary && summary.yield_trend.length >= 2
      ? summary.yield_trend[summary.yield_trend.length - 1].yield -
        summary.yield_trend[summary.yield_trend.length - 2].yield
      : 0;

  const riskByHour = forecast.map((p) => ({
    hour: p.h,
    risk: p.risk,
  }));

  const syncLabel = forecastQuery.dataUpdatedAt
    ? `LIVE · synced ${new Date(forecastQuery.dataUpdatedAt).toLocaleTimeString()}`
    : "LIVE · syncing";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Yield Prediction Center"
        title="Wafer Yield Forecasting"
        description="XGBoost regression on process parameters forecasts yield and loss probability."
        actions={
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <span className={`h-2 w-2 rounded-full bg-success ${forecastQuery.isFetching ? "animate-pulse" : ""}`} />
            {syncLabel}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Expected Yield (24h)"
          value={expectedYield24h}
          decimals={1}
          suffix="%"
          icon={Target}
          tone="primary"
        />
        <KpiCard label="Yield Loss Risk" value={avgRisk} decimals={1} suffix="%" icon={AlertTriangle} tone="warning" />
        <KpiCard label="Peak Loss Risk" value={maxRisk} decimals={1} suffix="%" icon={Percent} tone="destructive" />
        <KpiCard
          label="Trend (7d)"
          value={Math.abs(yieldTrend)}
          decimals={1}
          suffix="%"
          prefix={yieldTrend >= 0 ? "+" : "−"}
          icon={TrendingUp}
          tone={yieldTrend >= 0 ? "success" : "warning"}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel title="12-Hour Forecast" subtitle="Predicted yield with loss risk" className="lg:col-span-2">
          {forecast.length === 0 ? (
            <DashboardEmpty message="No yield forecast available." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={forecast}>
                <defs>
                  <linearGradient id="yf" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.17 220)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.78 0.17 220)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
                <XAxis dataKey="h" stroke="oklch(0.7 0.03 230)" fontSize={11} />
                <YAxis yAxisId="l" stroke="oklch(0.7 0.03 230)" fontSize={11} domain={["auto", "auto"]} />
                <YAxis yAxisId="r" orientation="right" stroke="oklch(0.7 0.03 230)" fontSize={11} domain={[0, "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area yAxisId="l" type="monotone" dataKey="expected" stroke="oklch(0.78 0.17 220)" fill="url(#yf)" strokeWidth={2} />
                <Line yAxisId="r" type="monotone" dataKey="risk" stroke="oklch(0.78 0.17 75)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Loss Risk by Hour" subtitle="Model-predicted yield loss probability">
          {riskByHour.length === 0 ? (
            <DashboardEmpty message="No risk data available." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={riskByHour} layout="vertical">
                <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
                <XAxis type="number" stroke="oklch(0.7 0.03 230)" fontSize={11} />
                <YAxis type="category" dataKey="hour" stroke="oklch(0.7 0.03 230)" fontSize={11} width={50} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="risk" fill="oklch(0.72 0.18 195)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <Panel title="Historical Comparison" subtitle="7-day actual vs predicted from dashboard inference">
        {!summary?.yield_trend?.length ? (
          <DashboardEmpty message="No historical yield trend available." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={summary.yield_trend}>
              <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
              <XAxis dataKey="day" stroke="oklch(0.7 0.03 230)" fontSize={11} />
              <YAxis domain={["auto", "auto"]} stroke="oklch(0.7 0.03 230)" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="yield" stroke="oklch(0.72 0.18 155)" fill="oklch(0.72 0.18 155 / 0.2)" strokeWidth={2} />
              <Area type="monotone" dataKey="predicted" stroke="oklch(0.78 0.17 220)" fill="oklch(0.78 0.17 220 / 0.15)" strokeWidth={2} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
