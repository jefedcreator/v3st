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
      className="bg-void/90 supports-[backdrop-filter]:bg-void/70 fixed inset-x-0 bottom-0 z-40 flex h-16 border-t border-stroke backdrop-blur-sm"
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
              "flex h-16 flex-1 flex-col items-center justify-center gap-1",
              active ? "text-heading" : "text-subtle",
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
