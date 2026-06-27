const DEFAULT_API_URL = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  if (!configured) {
    return DEFAULT_API_URL;
  }

  return configured.replace(/\/+$/, "");
}

export const API_BASE_URL = getApiBaseUrl();
