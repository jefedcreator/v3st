export function KeyValue({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={className ?? "grid gap-3"}>
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground text-sm">{item.label}</dt>
          <dd className="text-ink text-right text-sm tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
