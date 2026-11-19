"use client";

import { useRouter } from "next/navigation";
import { useNow } from "@/hooks/app/use-now";
import { useMarkRead, useNotificationsInfinite } from "@/hooks/app/use-notifications";

import { notificationTime } from "./notification-time";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/primitives";

export function NotificationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotificationsInfinite();
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
        <div className="mt-4 flex flex-col gap-2">
          {items.length === 0 && (
            <p className="text-muted-foreground py-8 text-center text-sm">No notifications yet.</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openItem(item.id, item.read, item.link)}
              className="focus-visible:outline-ring hover:bg-secondary flex min-h-11 items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {item.read ? null : (
                <span className="bg-gain mt-2 size-2 shrink-0 rounded-full">
                  <span className="sr-only">Unread</span>
                </span>
              )}
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-ink text-sm font-medium">{item.title}</span>
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
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              Show older
            </Button>
          )}
        </div>
        {someUnread && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void markAllRead()}>
            Mark all as read
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
