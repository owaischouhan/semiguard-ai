import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  icon: LucideIcon;
  tone?: "primary" | "accent" | "success" | "warning" | "destructive";
  delta?: string;
  hint?: string;
}

const TONES = {
  primary: { text: "text-primary", bg: "from-primary/20 to-primary/0", border: "border-primary/30" },
  accent: { text: "text-accent", bg: "from-accent/20 to-accent/0", border: "border-accent/30" },
  success: { text: "text-success", bg: "from-success/20 to-success/0", border: "border-success/30" },
  warning: { text: "text-warning", bg: "from-warning/20 to-warning/0", border: "border-warning/30" },
  destructive: { text: "text-destructive", bg: "from-destructive/20 to-destructive/0", border: "border-destructive/30" },
};

export function KpiCard({ label, value, suffix = "", prefix = "", decimals = 0, icon: Icon, tone = "primary", delta, hint }: Props) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => `${prefix}${v.toFixed(decimals)}${suffix}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 1.2, ease: "easeOut" });
    return () => c.stop();
  }, [value, mv]);
  const t = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden glass rounded-xl p-5 border ${t.border}`}
    >
      <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-radial ${t.bg} blur-2xl opacity-70`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <motion.div className={`mt-2 text-3xl font-semibold font-mono tabular-nums ${t.text} text-glow`}>
            {rounded}
          </motion.div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`h-10 w-10 grid place-items-center rounded-lg bg-card/60 border ${t.border} ${t.text}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {delta && (
        <div className="relative mt-3 text-xs font-mono text-muted-foreground">
          <span className={t.text}>{delta}</span> vs prev shift
        </div>
      )}
    </motion.div>
  );
}