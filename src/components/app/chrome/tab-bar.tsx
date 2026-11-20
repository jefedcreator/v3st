"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/utils/cn";
import { APP_TABS, isActive } from "./nav";

// The fixed phone tab bar, 64px plus the safe-area inset.
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="App"
      className="bg-void fixed inset-x-0 bottom-0 z-40 flex border-t border-stroke"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {APP_TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:outline-ring flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2",
              active ? "text-heading font-semibold" : "text-muted-foreground hover:text-heading",
            )}
          >
            <Icon className={cn("size-5", active && "text-gain")} aria-hidden="true" />
            <span className="text-[13px] leading-none">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
