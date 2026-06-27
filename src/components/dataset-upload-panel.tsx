import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2, FileSpreadsheet, Loader2, Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadCSV } from "@/lib/api";
import { dashboardKeys, modelPerformanceKeys } from "@/lib/queries";

const systemStatusKey = ["system", "status"] as const;

const ACCEPTED_TYPES = [".csv"];
const ACCEPTED_MIME = ["text/csv", "application/vnd.ms-excel"];

function isCsvFile(file: File) {
  const lower = file.name.toLowerCase();
  return ACCEPTED_TYPES.some((ext) => lower.endsWith(ext)) || ACCEPTED_MIME.includes(file.type);
}

export function DatasetUploadPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const resetPanel = useCallback(() => {
    setSelectedFile(null);
    setStatusMessage(null);
    setAnalysisComplete(false);
    setDragActive(false);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: uploadCSV,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      await queryClient.invalidateQueries({ queryKey: modelPerformanceKeys.all });
      await queryClient.invalidateQueries({ queryKey: systemStatusKey });
      setAnalysisComplete(true);
      setStatusMessage(
        `Analysis completed. ${result.records_inserted.toLocaleString()} records processed · ${result.anomalies_detected} anomalies detected. Dashboard refreshed.`,
      );
    },
    onError: (error: Error) => {
      setAnalysisComplete(false);
      setStatusMessage(error.message);
    },
  });

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetPanel();
    onOpenChange(nextOpen);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!isCsvFile(file)) {
      setStatusMessage("Unsupported file type. Please upload a CSV file.");
      setAnalysisComplete(false);
      return;
    }
    setSelectedFile(file);
    setStatusMessage(null);
    setAnalysisComplete(false);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setStatusMessage("Select a CSV file to upload.");
      return;
    }
    setStatusMessage(null);
    uploadMutation.mutate(selectedFile);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const isError =
    statusMessage != null &&
    (statusMessage.toLowerCase().includes("fail") ||
      statusMessage.toLowerCase().includes("error") ||
      statusMessage.toLowerCase().includes("unsupported"));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload Dataset
          </DialogTitle>
          <DialogDescription>
            Upload sensor telemetry to run model inference and refresh fab dashboards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors cursor-pointer ${
              dragActive
                ? "border-primary bg-primary/10"
                : selectedFile
                  ? "border-accent/50 bg-accent/5"
                  : "border-border/70 bg-card/30 hover:border-primary/40 hover:bg-card/50"
            }`}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            ) : analysisComplete ? (
              <CheckCircle2 className="h-10 w-10 text-success" />
            ) : (
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">
                {selectedFile ? selectedFile.name : "Drag and drop your file here"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                or click to browse from your device
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />

          <div className="rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Supported file types
            </p>
            <p className="mt-1 text-sm text-foreground">CSV (.csv) — sensor telemetry with process readings</p>
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running inference…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload &amp; Analyze
              </>
            )}
          </button>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
          {statusMessage && (
            <p
              className={`text-xs font-mono text-left ${
                isError ? "text-destructive" : analysisComplete ? "text-success" : "text-muted-foreground"
              }`}
            >
              {statusMessage}
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
