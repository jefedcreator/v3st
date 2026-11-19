import Link from "next/link";
import { cn } from "@/utils/cn";
import { moneyText } from "@/primitives/money-text";
import type { AppActivityItemDto } from "@/types/app";
import { progressLabel } from "./activity-groups";

// One feed row: title and subtitle, signed amount, and progress text.
export function ActivityRow({ item }: { item: AppActivityItemDto }) {
  const progress = progressLabel(item.status);
  return (
    <Link
      href={`/activity/${item.id}`}
      className="flex min-h-11 items-center justify-between gap-4 border-b border-stroke py-3 transition-colors last:border-b-0 hover:bg-surface"
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ink truncate text-[15px]">{item.title}</span>
        <span className="text-muted-foreground truncate text-sm">{item.subtitle}</span>
        {progress !== null && (
          <span className={cn("text-sm", item.status === "failed" ? "text-loss" : "text-subtle")}>
            {progress}
          </span>
        )}
      </span>
      <span className="text-ink shrink-0 text-[15px] tabular-nums">
        {moneyText(item.amount_kobo, item.direction)}
      </span>
    </Link>
  );
}
