"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { subscribeAuth } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
          mutations: {
            // Mutations that create jobs carry an Idempotency-Key; retries are decided per call site.
            retry: false,
          },
        },
      }),
  );
  useEffect(() => subscribeAuth(client), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
