"use client";

import { AppError } from "@/components/app/app-error";

export default function AppErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return <AppError reset={reset} />;
}
