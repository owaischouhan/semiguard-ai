import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="text-[11px] uppercase tracking-[0.22em] text-accent font-mono">{eyebrow}</div>}
        <h1 className="mt-1 text-2xl lg:text-3xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

export function Panel({ title, subtitle, children, className = "", actions }: { title?: string; subtitle?: string; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={`glass rounded-xl p-5 relative overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-foreground tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: "normal" | "warning" | "critical" }) {
  const map = {
    normal: "bg-success/15 text-success border-success/40",
    warning: "bg-warning/15 text-warning border-warning/40",
    critical: "bg-destructive/15 text-destructive border-destructive/40",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wider font-mono ${map[severity]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${severity === "normal" ? "bg-success" : severity === "warning" ? "bg-warning" : "bg-destructive"}`} />
      {severity}
    </span>
  );
}