import { cn } from "@/utils/cn";
import { formatLagosDateTime } from "@/utils/format";
import type { AppTimelineStepDto } from "@/types/app";

// An ordered list on a 2px signal spine: filled when done, hollow when not.
export function Timeline({ steps }: { steps: AppTimelineStepDto[] }) {
  return (
    <ol className="relative flex flex-col gap-4 pl-8">
      <span
        aria-hidden="true"
        className="bg-signal absolute top-1.5 bottom-1.5 left-3 w-0.5 rounded"
      />
      {steps.map((step, index) => (
        <li key={`${step.label}-${index}`} className="relative">
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 -left-3.5 flex -translate-x-1/2 items-center justify-center rounded-full",
              step.done ? "bg-signal size-3.5" : "border-stroke bg-surface size-3.5 border-[1.5px]",
            )}
          />
          <span className="flex flex-col gap-0.5">
            <span
              className={cn(
                "text-[15px]",
                step.done ? "text-ink" : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {step.at !== null && (
              <span className="text-subtle text-[13px]">
                <time dateTime={step.at}>{formatLagosDateTime(step.at)}</time>
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
