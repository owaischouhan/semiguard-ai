import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Brain, Cpu, LayoutDashboard,
  Map, Settings, TrendingUp, Upload, Wrench, Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { fetchSystemStatus } from "@/lib/api";
import { DatasetUploadPanel } from "./dataset-upload-panel";
import { SystemControlCenter } from "./system-control-center";

const systemStatusKey = ["system", "status"] as const;

const NAV = [
  { to: "/", label: "Executive", icon: LayoutDashboard },
  { to: "/monitoring", label: "Real-Time Monitoring", icon: Activity },
  { to: "/fault-detection", label: "Fault Detection", icon: AlertTriangle },
  { to: "/predictive-maintenance", label: "Predictive Maintenance", icon: Wrench },
  { to: "/yield", label: "Yield Prediction", icon: TrendingUp },
  { to: "/model-performance", label: "Model Performance", icon: BarChart3 },
  { to: "/root-cause", label: "Root Cause Analysis", icon: Brain },
  { to: "/fab-map", label: "Fab Digital Twin", icon: Map },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [systemControlOpen, setSystemControlOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: systemStatus } = useQuery({
    queryKey: systemStatusKey,
    queryFn: fetchSystemStatus,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const modelsLabel =
    systemStatus && systemStatus.models_loaded >= 4
      ? `${systemStatus.models_loaded} Active`
      : systemStatus
        ? `${systemStatus.models_loaded}/4`
        : "…";
  const modelsTone =
    systemStatus?.api_status === "healthy"
      ? "primary"
      : systemStatus?.api_status === "degraded"
        ? "warning"
        : "primary";

  return (
    <div className="relative min-h-screen text-foreground">
      <div className="fixed inset-0 grid-bg pointer-events-none opacity-60" />
      <div className="relative flex min-h-screen">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar/70 backdrop-blur-xl">
          <div className="px-5 py-5 flex items-center gap-3 border-b border-border">
            <div className="relative h-9 w-9 rounded-md bg-gradient-to-br from-primary to-accent grid place-items-center glow-primary">
              <Cpu className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <div className="font-semibold tracking-tight text-foreground">SemiGuard AI</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Fab Intelligence</div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map((n) => {
              const active = pathname === n.to;
              const Icon = n.icon;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-[3px] rounded-r bg-primary glow-primary"
                    />
                  )}
                  <Icon className="h-4 w-4" />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border">
            <motion.button
              type="button"
              onClick={() => setSystemControlOpen(true)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="glass rounded-md p-3 flex items-center gap-3 w-full hover:bg-sidebar-accent/60 transition-colors cursor-pointer"
              aria-label="Open system control panel"
            >
              <div className="grid h-8 w-8 place-items-center rounded-md bg-card/60 border border-border/60">
                <Settings className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-xs text-left flex-1">
                <div className="text-foreground font-medium">System Control Panel</div>
                <div className="text-muted-foreground">Status · refresh · export</div>
              </div>
            </motion.button>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-30 glass border-b border-border">
            <div className="flex items-center gap-4 px-4 lg:px-8 h-14">
              <div className="lg:hidden flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                <span className="font-semibold">SemiGuard</span>
              </div>
              <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Zap className="h-3.5 w-3.5 text-accent" />
                FAB-A · CLEANROOM CLASS 10 · <UtcClock />
              </div>
              <div className="ml-auto flex items-center gap-3">
                <StatusPill label="AI Models" value={modelsLabel} tone={modelsTone} />
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Dataset
                </button>
                <button
                  type="button"
                  onClick={() => setSystemControlOpen(true)}
                  className="inline-flex items-center justify-center rounded-md border border-border bg-card/40 p-2 text-muted-foreground transition-colors hover:bg-card/70 hover:text-foreground lg:hidden"
                  aria-label="Open system control panel"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 lg:p-8 space-y-6">{children}</main>
        </div>
      </div>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border overflow-x-auto py-2">
        <div className="flex min-w-max justify-around gap-1 px-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[9px] shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className="h-4 w-4" />
                {n.label.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      </nav>

      <DatasetUploadPanel open={uploadOpen} onOpenChange={setUploadOpen} />
      <SystemControlCenter open={systemControlOpen} onOpenChange={setSystemControlOpen} />
    </div>
  );
}

function UtcClock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setTime(new Date().toUTCString().slice(17, 25));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span suppressHydrationWarning>{time ?? "--:--:--"} UTC</span>;
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "primary" | "accent" | "warning" }) {
  const colors = {
    primary: "text-primary border-primary/40 bg-primary/10",
    accent: "text-accent border-accent/40 bg-accent/10",
    warning: "text-warning border-warning/40 bg-warning/10",
  } as const;
  return (
    <div className={`hidden md:flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-mono ${colors[tone]}`}>
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
