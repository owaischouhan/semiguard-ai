import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, BarChart3, CheckCircle2, Crosshair, Gauge,
  LineChart as LineChartIcon, Target, TrendingUp,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader, Panel } from "@/components/section";
import { DashboardError, DashboardLoading } from "@/components/dashboard-query-states";
import { fetchModelPerformance } from "@/lib/api";
import { modelPerformanceKeys } from "@/lib/queries";

export const Route = createFileRoute("/_app/model-performance")({
  component: ModelPerformancePage,
});

const tooltipStyle = {
  background: "oklch(0.19 0.035 255)",
  border: "1px solid oklch(0.4 0.05 230 / 0.4)",
  borderRadius: 8,
  fontSize: 12,
};

function ModelPerformancePage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: modelPerformanceKeys.metrics(),
    queryFn: fetchModelPerformance,
    refetchOnWindowFocus: true,
  });

  if (isLoading) {
    return (
      <DashboardLoading
        eyebrow="ML Ops"
        title="Model Performance"
        description="Evaluating model metrics…"
      />
    );
  }

  if (isError || !data) {
    return (
      <DashboardError
        eyebrow="ML Ops"
        title="Model Performance"
        description="Full-dataset holdout metrics from trained models."
        message={error instanceof Error ? error.message : "Failed to load model performance metrics."}
        onRetry={() => refetch()}
      />
    );
  }

  const regressionComparison = [
    { model: "Yield", mae: data.yield_model.mae, rmse: data.yield_model.rmse, r2: data.yield_model.r2 },
    { model: "RUL", mae: data.rul_model.mae, rmse: data.rul_model.rmse, r2: data.rul_model.r2 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="ML Ops"
        title="Model Performance"
        description={`Evaluated ${new Date(data.evaluated_at).toLocaleString()}`}
        actions={
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5 text-accent" />
            Full-dataset holdout metrics
          </div>
        }
      />

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Failure Classifier — Random Forest</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-4">
          <KpiCard label="Accuracy" value={data.failure_classifier.accuracy * 100} decimals={2} suffix="%" icon={CheckCircle2} tone="success" hint="correct classifications" />
          <KpiCard label="Precision" value={data.failure_classifier.precision * 100} decimals={2} suffix="%" icon={Crosshair} tone="primary" hint="positive predictive value" />
          <KpiCard label="Recall" value={data.failure_classifier.recall * 100} decimals={2} suffix="%" icon={Target} tone="accent" hint="failure detection rate" />
          <KpiCard label="F1 Score" value={data.failure_classifier.f1_score * 100} decimals={2} suffix="%" icon={Gauge} tone="warning" hint="precision-recall balance" />
          <KpiCard label="ROC-AUC" value={data.failure_classifier.roc_auc * 100} decimals={2} suffix="%" icon={AlertTriangle} tone="destructive" hint="ranking quality" />
        </div>
        <Panel title="Classifier Metrics" subtitle="Accuracy, precision, recall, F1, and ROC-AUC">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.failure_classifier.chart}>
              <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
              <XAxis dataKey="metric" stroke="oklch(0.7 0.03 230)" fontSize={11} />
              <YAxis stroke="oklch(0.7 0.03 230)" fontSize={11} domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "Score"]} />
              <Bar dataKey="value" fill="oklch(0.78 0.17 220)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Yield Model — XGBoost Regressor</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <KpiCard label="MAE" value={data.yield_model.mae} decimals={3} suffix="%" icon={TrendingUp} tone="primary" hint="mean absolute error" />
            <KpiCard label="RMSE" value={data.yield_model.rmse} decimals={3} suffix="%" icon={LineChartIcon} tone="accent" hint="root mean squared error" />
            <KpiCard label="R²" value={data.yield_model.r2} decimals={4} icon={CheckCircle2} tone="success" hint="variance explained" />
          </div>
          <Panel title="Yield — Actual vs Predicted" subtitle="Sampled validation records">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.yield_model.chart}>
                <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
                <XAxis dataKey="index" stroke="oklch(0.7 0.03 230)" fontSize={10} />
                <YAxis stroke="oklch(0.7 0.03 230)" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="actual" stroke="oklch(0.72 0.18 155)" strokeWidth={2} dot={false} name="Actual" />
                <Line type="monotone" dataKey="predicted" stroke="oklch(0.78 0.17 220)" strokeWidth={2} dot={false} strokeDasharray="4 3" name="Predicted" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">RUL Model — Random Forest Regressor</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <KpiCard label="MAE" value={data.rul_model.mae} decimals={2} suffix=" hrs" icon={TrendingUp} tone="primary" hint="mean absolute error" />
            <KpiCard label="RMSE" value={data.rul_model.rmse} decimals={2} suffix=" hrs" icon={LineChartIcon} tone="accent" hint="root mean squared error" />
            <KpiCard label="R²" value={data.rul_model.r2} decimals={4} icon={CheckCircle2} tone="success" hint="variance explained" />
          </div>
          <Panel title="RUL — Actual vs Predicted" subtitle="Sampled validation records">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.rul_model.chart}>
                <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
                <XAxis dataKey="index" stroke="oklch(0.7 0.03 230)" fontSize={10} />
                <YAxis stroke="oklch(0.7 0.03 230)" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Line type="monotone" dataKey="actual" stroke="oklch(0.78 0.17 75)" strokeWidth={2} dot={false} name="Actual" />
                <Line type="monotone" dataKey="predicted" stroke="oklch(0.72 0.18 195)" strokeWidth={2} dot={false} strokeDasharray="4 3" name="Predicted" />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>

      <Panel title="Regression Model Comparison" subtitle="MAE and RMSE across yield and RUL models">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={regressionComparison}>
            <CartesianGrid stroke="oklch(0.4 0.05 230 / 0.15)" />
            <XAxis dataKey="model" stroke="oklch(0.7 0.03 230)" fontSize={11} />
            <YAxis stroke="oklch(0.7 0.03 230)" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="mae" fill="oklch(0.78 0.17 220)" radius={[4, 4, 0, 0]} name="MAE" />
            <Bar dataKey="rmse" fill="oklch(0.72 0.18 195)" radius={[4, 4, 0, 0]} name="RMSE" />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
