// The grain geometry comes from docs/brand/v3st-grain.svg.
export function ProductLogo({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="18.62 1.75 62.76 97.5"
      className={className}
      fill="currentColor"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "V3ST"}
    >
      <path d="M53.5 96L53.5 43L46.5 43L46.5 96ZM57.39 65.5A11.31 11.31 0 0 1 65.39 51.64A11.31 11.31 0 0 1 57.39 65.5ZM34.61 51.64A11.31 11.31 0 0 1 42.61 65.5A11.31 11.31 0 0 1 34.61 51.64ZM57.39 51.5A11.31 11.31 0 0 1 65.39 37.64A11.31 11.31 0 0 1 57.39 51.5ZM34.61 37.64A11.31 11.31 0 0 1 42.61 51.5A11.31 11.31 0 0 1 34.61 37.64ZM57.35 37.5A10.25 10.25 0 0 1 64.6 24.94A10.25 10.25 0 0 1 57.35 37.5ZM35.4 24.94A10.25 10.25 0 0 1 42.65 37.5A10.25 10.25 0 0 1 35.4 24.94ZM50 30.5A21.93 21.93 0 0 1 50 3.5A21.93 21.93 0 0 1 50 30.5ZM57 97.5A26.59 26.59 0 0 1 79.63 74.87A26.59 26.59 0 0 1 57 97.5ZM20.37 74.87A26.59 26.59 0 0 1 43 97.5A26.59 26.59 0 0 1 20.37 74.87Z" />
    </svg>
  );
}
