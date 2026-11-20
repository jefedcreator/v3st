import { cn } from "@/utils/cn";

// A stock's mark: its logo, or its first letter on a raised disc.
export function StockMark({
  logoPath,
  name,
  size = 40,
}: {
  logoPath: string | null;
  name: string;
  size?: 32 | 40 | 48;
}) {
  const dim = size === 32 ? "size-8" : size === 40 ? "size-10" : "size-12";
  if (logoPath === null) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "bg-secondary text-heading grid shrink-0 place-items-center rounded-full text-sm font-semibold uppercase",
          dim,
        )}
      >
        {name.charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={logoPath}
      alt=""
      className={cn("shrink-0 rounded-full object-cover", dim)}
      width={size}
      height={size}
      loading="lazy"
    />
  );
}
