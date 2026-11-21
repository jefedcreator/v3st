import Link from "next/link";

import { Logo } from "@/components/logo";
import { Badge } from "@/primitives";
import { AccountButton } from "./account-button";
import { NotificationsButton } from "./notifications-button";

// The phone top bar: the logo and Beta on the left, bell and account on the
// right. From 768px only the bell and account show.
export function TopBar() {
  return (
    <div className="bg-void sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-stroke px-4">
      <Link href="/home" className="flex min-h-11 items-center gap-2.5 rounded-full md:hidden">
        <Logo className="text-[18px]" />
        <Badge>Beta</Badge>
      </Link>
      <span aria-hidden="true" className="hidden flex-1 md:block" />
      <div className="ml-auto flex items-center gap-1">
        <NotificationsButton />
        <AccountButton />
      </div>
    </div>
  );
}
