import { cn } from "@/utils/cn";

export function GrowthArtwork({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
    >
      <rect width="800" height="600" fill="#F7F8F2" />
      <g fill="none" strokeLinecap="round">
        <path
          d="M -40 560 A 420 420 0 0 1 380 140"
          stroke="#E6EEDD"
          strokeWidth="90"
        />
        <path
          d="M 40 600 A 340 340 0 0 1 380 260"
          stroke="#B9D987"
          strokeWidth="26"
        />
        <path
          d="M 120 620 A 260 260 0 0 1 380 360"
          stroke="#166534"
          strokeWidth="10"
        />
        <path
          d="M 620 620 C 560 480 600 380 700 300 C 640 400 660 500 700 620 Z"
          fill="#E6EEDD"
          stroke="none"
        />
        <path
          d="M 700 300 C 640 400 660 500 700 620"
          stroke="#166534"
          strokeWidth="6"
        />
        <path
          d="M 700 300 C 730 380 760 460 820 520 C 760 470 730 390 700 300 Z"
          fill="#B9D987"
          stroke="none"
        />
        <circle cx="380" cy="140" r="10" fill="#166534" stroke="none" />
        <circle cx="380" cy="260" r="7" fill="#3F8F5F" stroke="none" />
      </g>
    </svg>
  );
}
