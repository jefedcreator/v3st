"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { appApi } from "@/utils/app-api";

// Signs the customer out: the API session first, then the local cache, then
// the browser goes to /signin with the signed-out line. Privy's own logout
// runs on /signin, where its SDK loads.
export function useSignOut(): { signOut: () => Promise<void>; pending: boolean } {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const signOut = React.useCallback(async () => {
    setPending(true);
    try {
      await appApi.auth.logout();
    } catch {
      // Leaving without a session is fine when the API call failed.
    }
    queryClient.clear();
    window.location.assign("/signin?signed-out=1");
    void router;
  }, [queryClient, router]);

  return { signOut, pending };
}
