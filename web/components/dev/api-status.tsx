"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, api } from "@/lib/api";

/** Development-only check that the web app can reach the API (`GET /health`). */
export function ApiStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => api.health(signal),
    retry: false,
  });

  return (
    <section aria-labelledby="api-status-title" className="rounded-lg border p-4 text-sm">
      <h2 id="api-status-title" className="font-medium">
        Status API (hanya mode dev)
      </h2>
      <p className="text-muted-foreground">
        <code>{API_BASE_URL}</code>
      </p>
      <p role="status" className="mt-2">
        {health.isPending && "Memeriksa…"}
        {health.isSuccess && "Terhubung."}
        {health.isError && `Tidak terhubung: ${health.error.message}`}
      </p>
      {health.isSuccess && (
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-xs" tabIndex={0}>
          {JSON.stringify(health.data, null, 2)}
        </pre>
      )}
    </section>
  );
}
