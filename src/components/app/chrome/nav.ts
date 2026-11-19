import { House, ChartLineUp, CurrencyNgn, Plant, ClockCounterClockwise, GearSix } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import type { AppSessionDto } from "@/types/app";

export type AppTab = {
  href: string;
  label: string;
  icon: Icon;
};

// The four places in the tab bar and sidebar.
export const APP_TABS: AppTab[] = [
  { href: "/home", label: "Home", icon: House },
  { href: "/stocks", label: "Stocks", icon: ChartLineUp },
  { href: "/cash", label: "Cash", icon: CurrencyNgn },
  { href: "/earn", label: "Earn", icon: Plant },
];

// Desktop-only extras.
export const SIDEBAR_EXTRA: AppTab[] = [
  { href: "/activity", label: "Activity", icon: ClockCounterClockwise },
];

export const SETTINGS_ITEM: AppTab = {
  href: "/settings",
  label: "Settings",
  icon: GearSix,
};

// A place is active on its own route and its children, never on a neighbour.
export function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

// Up to two initials for the account button.
export function initialsFor(session: AppSessionDto | null): string {
  if (session?.signed_in !== true) return "";
  const name = session.customer.display_name ?? session.customer.first_name;
  if (name?.trim().length) {
    const parts = name.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }
  const email = session.customer.email;
  if (email?.length) return email.charAt(0).toUpperCase();
  return "";
}
