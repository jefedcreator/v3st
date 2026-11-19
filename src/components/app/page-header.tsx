import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  back,
  actions,
}: {
  title: string;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-3 pt-4">
      {back && (
        <Link
          href={back.href}
          aria-label={back.label}
          className="text-muted-foreground hover:text-heading focus-visible:outline-ring grid size-11 shrink-0 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-3"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
      )}
      <h1 className="type-app-title text-heading flex-1">{title}</h1>
      {actions}
    </header>
  );
}
