"use client";

import { useRouter } from "next/navigation";

import { useNow } from "@/hooks/app/use-now";
import { useMarkRead, useNotificationsInfinite } from "@/hooks/app/use-notifications";
import { AppApiError } from "@/utils/app-api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/primitives";
import { notificationTime } from "./notification-time";

export function NotificationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotificationsInfinite(open);
  const { markRead, markAllRead } = useMarkRead();

  async function openItem(id: string, read: boolean, link: string) {
    try {
      if (!read) await markRead([id]);
    } catch {
      // The row still opens even if marking it read fails.
    }
    onOpenChange(false);
    router.push(link);
  }

  const items = data?.pages.flatMap((page) => page.items) ?? [];
  const someUnread = items.some((item) => !item.read);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>What has happened since you were last here.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex flex-col">
          {isPending && error === null && (
            <div className="flex flex-col gap-3" aria-hidden="true">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          {error !== null && items.length === 0 && (
            <p role="status" className="text-loss py-6 text-sm">
              {error instanceof AppApiError ? error.message : "Something went wrong. Please try again."}
            </p>
          )}
          {!isPending && error === null && items.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">No notifications yet.</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openItem(item.id, item.read, item.link)}
              className="focus-visible:outline-ring hover:bg-secondary -mx-3 flex min-h-11 items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <span className="flex w-2 shrink-0 justify-center pt-2">
                {item.read ? null : (
                  <span className="bg-gain size-2 rounded-full">
                    <span className="sr-only">Unread</span>
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-heading text-[15px] font-medium">{item.title}</span>
                <span className="text-muted-foreground text-sm">{item.body}</span>
                <span className="text-subtle text-[13px]">
                  <time dateTime={item.created_at}>{notificationTime(item.created_at, now)}</time>
                </span>
              </span>
            </button>
          ))}
          {hasNextPage && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 self-start"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? "Loading older…" : "Show older"}
            </Button>
          )}
        </div>
        {someUnread && (
          <Button variant="outline" className="mt-4" onClick={() => void markAllRead()}>
            Mark all as read
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
