import { Skeleton } from "@/primitives";

// The page bodies a loading.tsx draws while the server read is in flight.
export function AppSkeleton({ variant }: { variant: "home" | "list" | "detail" | "form" }) {
  if (variant === "home") {
    return (
      <div className="flex flex-col gap-6 py-8" aria-hidden="true">
        <div className="flex flex-col gap-3">
          <div className="bg-secondary h-3 w-20 rounded-full" />
          <Skeleton className="h-12 w-48" />
          <div className="bg-secondary h-3 w-36 rounded-full" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className="flex flex-col gap-3 py-8" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (variant === "detail") {
    return (
      <div className="flex flex-col gap-6 py-8" aria-hidden="true">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-14 w-56" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 py-8" aria-hidden="true">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-40" />
    </div>
  );
}
