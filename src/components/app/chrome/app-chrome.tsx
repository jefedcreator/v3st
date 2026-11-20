"use client";

import type { ReactNode } from "react";

import { cn } from "@/utils/cn";
import { Sidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TopBar } from "./top-bar";

// The one place the app chrome is mounted: by the (app) layout, never a page.
export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a
        href="#app-main"
        className="focus-visible:outline-ring sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-full focus-visible:bg-surface-raised focus-visible:px-4 focus-visible:py-2 focus-visible:outline-2"
      >
        Skip to content
      </a>
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          id="app-main"
          className={cn(
            "mx-auto w-full max-w-[720px] flex-1 px-4 pt-2",
            "pb-[calc(64px+env(safe-area-inset-bottom)+24px)]",
            "md:px-8 md:pb-12",
          )}
        >
          {children}
        </main>
        <div className="md:hidden">
          <TabBar />
        </div>
      </div>
    </div>
  );
}
