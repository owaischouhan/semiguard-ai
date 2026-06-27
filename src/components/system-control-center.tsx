import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Box, Database, FileDown, Loader2, RefreshCw, Settings, Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchSystemStatus, PDF_EXPORT_URL, type SystemStatus } from "@/lib/api";
import { dashboardKeys, modelPerformanceKeys } from "@/lib/queries";

function StatusDot({ tone }: { tone: "success" | "warning" | "destructive" | "muted" }) {
  const colors = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    muted: "bg-muted-foreground",
  } as const;

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[tone]}`} />;
}

function StatusCard({
  icon: Icon,
  label,
  value,
  tone = "success",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "success" | "warning" | "destructive" | "muted";
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-sm font-medium text-foreground">{value}</div>
      </div>
      <StatusDot tone={tone} />
    </div>
  );
}

export function SystemControlCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setActionMessage(null);
      const data = await fetchSystemStatus();
      setStatus(data);
      setLastRefreshed(new Date().toLocaleString());
    } catch {
      setStatus({
        backend: "offline",
        database: "unknown",
        models_loaded: 0,
        dataset_name: "",
        dataset_records: 0,
        api_status: "down",
        last_sync: new Date().toISOString(),
        app_version: "1.0.0",
      });
      setLastRefreshed(new Date().toLocaleString());
      setActionMessage("Unable to reach backend status endpoint.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setActionMessage(null);
      fetchStatus();
    }
  }, [open]);

  const refreshDashboardMutation = useMutation({
    mutationFn: async () => {
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      await queryClient.invalidateQueries({ queryKey: modelPerformanceKeys.all });
      await fetchStatus();
    },
    onSuccess: () => {
      setActionMessage("Dashboard data refreshed.");
    },
    onError: (error: Error) => {
      setActionMessage(error.message);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(PDF_EXPORT_URL);
      if (!response.ok) throw new Error("Failed to export PDF report.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "semiguard_fab_report.pdf";
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      setActionMessage("PDF report downloaded.");
    },
    onError: (error: Error) => {
      setActionMessage(error.message);
    },
  });

  const backendTone = status?.backend === "online" ? "success" : "destructive";
  const databaseTone = status?.database === "unknown" ? "muted" : "success";
  const modelTone = status && status.models_loaded >= 4 ? "success" : status ? "warning" : "muted";
  const apiTone =
    status?.api_status === "healthy"
      ? "success"
      : status?.api_status === "degraded"
        ? "warning"
        : "destructive";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent" />
            System Control Panel
          </DialogTitle>
          <DialogDescription>
            Monitor fab infrastructure and run dashboard operations.
          </DialogDescription>
        </DialogHeader>

        {loading && !status ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System Status
              </h3>
              <div className="grid gap-2">
                <StatusCard
                  icon={Zap}
                  label="Backend Status"
                  value={status?.backend === "online" ? "Online" : "Offline"}
                  tone={backendTone}
                />
                <StatusCard
                  icon={Database}
                  label="Database Status"
                  value={status?.database ? status.database.toUpperCase() : "Unknown"}
                  tone={databaseTone}
                />
                <StatusCard
                  icon={Box}
                  label="Model Status"
                  value={
                    status
                      ? `${status.models_loaded}/4 models loaded · API ${status.api_status}`
                      : "Unknown"
                  }
                  tone={modelTone === "success" && status?.api_status === "healthy" ? "success" : apiTone}
                />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Operations
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => refreshDashboardMutation.mutate()}
                  disabled={refreshDashboardMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-card disabled:opacity-60"
                >
                  {refreshDashboardMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 text-primary" />
                  )}
                  Refresh Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-card disabled:opacity-60"
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 text-accent" />
                  )}
                  Export PDF
                </button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
          {actionMessage && (
            <p className="text-xs font-mono text-left text-muted-foreground">{actionMessage}</p>
          )}
          {lastRefreshed && (
            <p className="text-xs text-muted-foreground text-left">
              Last refreshed {lastRefreshed}
            </p>
          )}
          <button
            type="button"
            onClick={fetchStatus}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card/60 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh System Status
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
