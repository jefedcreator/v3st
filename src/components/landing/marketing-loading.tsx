import { Skeleton } from "@/primitives";

export default function MarketingLoading() {
  return (
    <main
      className="shell grid min-h-dvh place-content-center gap-8 py-28"
      aria-label="Loading V3ST preview"
      aria-busy="true"
    >
      <span className="wordmark text-center">v3st.</span>
      <Skeleton className="mx-auto h-20 w-[min(80vw,42rem)]" />
      <Skeleton className="mx-auto h-12 w-[min(70vw,30rem)]" />
      <Skeleton className="mx-auto h-14 w-48 rounded-full" />
      <p className="text-muted-foreground text-center">
        Loading the illustrative beta preview.
      </p>
    </main>
  );
}
