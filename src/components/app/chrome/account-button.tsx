"use client";

import Link from "next/link";
import { User } from "@phosphor-icons/react/dist/ssr";

import { useAppSession } from "@/components/app/app-providers";
import { initialsFor } from "./nav";

// The initials avatar that goes to settings; a person icon until the session
// names someone.
export function AccountButton() {
  const session = useAppSession();
  const initials = initialsFor(session);
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className="focus-visible:outline-ring grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-3"
    >
      <span className="border-stroke bg-secondary text-heading grid size-8 place-items-center rounded-full border text-[13px] font-semibold">
        {initials === "" ? <User className="size-4" aria-hidden="true" /> : initials}
      </span>
    </Link>
  );
}
