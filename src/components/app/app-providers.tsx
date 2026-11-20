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
        // A dropped connection (status 0) and server errors retry twice; an
        // answered client error never does.
        retry: (failureCount, error) => {
          if (error instanceof AppApiError && error.status > 0 && error.status < 500) return false;
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

// Frames that arrive together (a resumed stream replays its backlog) are
// coalesced so each key is invalidated once per burst.
const INVALIDATE_BATCH_MS = 150;

// Opens the live stream and invalidates queries by area, keeping the session
// query fresh while the app is mounted.
function LiveStream({ session }: { session: AppSessionDto | null }) {
  const queryClient = useQueryClient();
  const pending = React.useRef(new Set<string>());
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const onAreas = React.useCallback(
    (areas: string[]) => {
      for (const area of areas) pending.current.add(area);
      if (timer.current !== null) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        const batch = [...pending.current];
        pending.current.clear();
        for (const key of keysForAreas(batch)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      }, INVALIDATE_BATCH_MS);
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

// The session as the live stream keeps it. This subscribes to the session
// query (LiveStream owns its fetching), so the unread count and the setup
// gate update the moment the session is refetched.
export function useAppSession(): AppSessionDto | null {
  const { data } = useQuery<AppSessionDto | null>({
    queryKey: appKeys.session,
    queryFn: () => appApi.session.get(),
    enabled: false,
  });
  return data ?? null;
}

export function useOnboardingComplete(): boolean {
  const session = useAppSession();
  return session?.signed_in === true && session.onboarding.complete;
}
