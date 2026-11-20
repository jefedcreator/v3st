"use client";

import * as React from "react";
import { Bell } from "@phosphor-icons/react/dist/ssr";

import { useAppSession } from "@/components/app/app-providers";
import { NotificationsDialog } from "./notifications-dialog";

export function NotificationsButton() {
  const session = useAppSession();
  const [open, setOpen] = React.useState(false);
  const unread =
    session !== null && session.signed_in === true ? session.unread_notifications : 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-heading focus-visible:outline-ring relative grid size-11 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-3"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && <span className="bg-gain absolute top-2.5 right-2.5 size-2 rounded-full" />}
      </button>
      <NotificationsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
