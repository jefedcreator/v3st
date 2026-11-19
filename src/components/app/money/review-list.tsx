import { cn } from "@/utils/cn";
import { KeyValue } from "@/primitives";

// A KeyValue with the emphasised rows in heading colour.
export function ReviewList({
  rows,
}: {
  rows: { label: string; value: React.ReactNode; emphasis?: boolean }[];
}) {
  return (
    <KeyValue
      items={rows.map((row) => ({
        label: row.label,
        value: (
          <span className={cn(row.emphasis === true && "text-heading font-medium")}>
            {row.value}
          </span>
        ),
      }))}
      className="grid gap-3"
    />
  );
}
