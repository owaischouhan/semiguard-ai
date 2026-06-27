import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/section";

export function DashboardLoading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="grid gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-lg border border-border bg-card/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function DashboardError({
  eyebrow,
  title,
  description,
  message,
  onRetry,
}: {
  eyebrow: string;
  title: string;
  description: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-3 text-sm text-foreground">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-4 py-2 text-sm transition-colors hover:bg-card"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function DashboardEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
