import Link from "next/link";

import { useAppSession } from "@/components/app/app-providers";
import { initialsFor } from "./nav";

// The avatar that goes to settings.
export function AccountButton() {
  const session = useAppSession();
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className="border-stroke bg-secondary text-heading focus-visible:outline-ring grid size-11 shrink-0 place-items-center rounded-full border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-3"
    >
      {initialsFor(session) || "·"}
    </Link>
  );
}
