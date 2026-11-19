import { cn } from "@/utils/cn";
import { moneyText } from "./money-text";

export function Money({
  kobo,
  direction = "none",
  className,
}: {
  kobo: string | null;
  direction?: "in" | "out" | "none";
  className?: string;
}) {
  const text = moneyText(kobo, direction);
  return (
    <data className={cn("tabular-nums", className)} value={kobo ?? ""}>
      {text}
      {kobo === null && <span className="sr-only">not available</span>}
    </data>
  );
}
