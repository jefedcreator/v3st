"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import type { AppSessionDto } from "@/types/app";
import { appKeys, keysForAreas } from "@/hooks/app/query-keys";
import { useAppEvents } from "@/hooks/app/use-app-events";

type QueryClientOptions = ConstructorParameters<typeof QueryClient>[0];

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error instanceof AppApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
    },
  } satisfies QueryClientOptions);
}

let browserQueryClient: QueryClient | null = null;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

// Opens the live stream and invalidates queries by area, keeping the session
// query fresh while the app is mounted.
function LiveStream({ session }: { session: AppSessionDto | null }) {
  const queryClient = useQueryClient();
  const onAreas = React.useCallback(
    (areas: string[]) => {
      for (const key of keysForAreas(areas)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
    [queryClient],
  );
  useAppEvents(onAreas);

  useQuery({
    queryKey: appKeys.session,
    queryFn: () => appApi.session.get(),
    initialData: session,
  });

  return null;
}

export function AppProviders({
  session,
  live,
  children,
}: {
  session: AppSessionDto | null;
  live: boolean;
  children: React.ReactNode;
}) {
  const [queryClient] = React.useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {live ? <LiveStream session={session} /> : null}
      {children}
    </QueryClientProvider>
  );
}

export function useAppSession(): AppSessionDto | null {
  const queryClient = useQueryClient();
  return queryClient.getQueryData<AppSessionDto>([...appKeys.session]) ?? null;
}

export function useOnboardingComplete(): boolean {
  const session = useAppSession();
  return session?.signed_in === true && session.onboarding.complete;
}
