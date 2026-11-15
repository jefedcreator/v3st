import { Skeleton } from "@/primitives";

export default function Loading() {
  return (
    <div aria-hidden="true" className="min-h-dvh bg-canvas px-6 pt-32">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6">
        <Skeleton className="h-14 w-full max-w-2xl md:h-20" />
        <Skeleton className="h-6 w-full max-w-xl" />
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
          <Skeleton className="h-12 w-44 rounded-full" />
          <Skeleton className="h-12 w-44 rounded-full" />
        </div>
        <Skeleton className="mt-16 h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}
