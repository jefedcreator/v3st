"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/utils/cn";
import { Logo } from "@/components/logo";
import { Badge } from "@/primitives";
import { APP_TABS, SETTINGS_ITEM, SIDEBAR_EXTRA, isActive } from "./nav";

// The desktop sidebar: the four places, Activity, then Settings at its foot.
export function Sidebar() {
  const pathname = usePathname();
  const items = [...APP_TABS, ...SIDEBAR_EXTRA];
  return (
    <div className="border-stroke bg-void sticky top-0 flex h-dvh w-62 shrink-0 flex-col border-r px-4 py-5">
      <Link href="/home" className="mb-6 flex min-h-11 items-center gap-2.5 px-2">
        <Logo />
        <Badge>Beta</Badge>
      </Link>
      <nav aria-label="App" className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-full px-3 text-[15px] transition-colors",
                active ? "text-heading bg-secondary" : "text-muted-foreground hover:text-heading",
              )}
            >
              <Icon className={cn("size-5", active && "text-gain")} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <SidebarSettings pathname={pathname} />
    </div>
  );
}

function SidebarSettings({ pathname }: { pathname: string }) {
  const active = isActive(pathname, SETTINGS_ITEM.href);
  const Icon = SETTINGS_ITEM.icon;
  return (
    <Link
      href={SETTINGS_ITEM.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mt-2 flex min-h-11 items-center gap-3 rounded-full px-3 text-[15px] transition-colors",
        active ? "text-heading bg-secondary" : "text-muted-foreground hover:text-heading",
      )}
    >
      <Icon className={cn("size-5", active && "text-gain")} aria-hidden="true" />
      {SETTINGS_ITEM.label}
    </Link>
  );
}
