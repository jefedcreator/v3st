"use client";

import { useNow } from "@/hooks/app/use-now";
import type { AppActivityPageDto } from "@/types/app";
import { Button } from "@/primitives";
import { useActivityList } from "@/hooks/app/use-activity";
import { groupByLagosDay } from "./activity-groups";
import { ActivityRow } from "./activity-row";

export function ActivityPage({ initial }: { initial?: AppActivityPageDto }) {
  const now = useNow(60_000);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useActivityList(initial);
  const pages = data?.pages ?? [];
  const items = pages.flatMap((page) => page.items);
  const groups = groupByLagosDay(items, now);

  return (
    <div className="flex flex-col gap-6 pt-4">
      <h1 className="type-app-title text-heading">Activity</h1>
      {items.length === 0 && (
        <p className="text-muted-foreground text-[15px]">
          Nothing yet. Money you add, invest or earn shows up here.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label} className="flex flex-col">
          <h2 className="text-muted-foreground mb-1 text-[13px] font-medium">{group.label}</h2>
          {group.items.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </section>
      ))}
      {hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
