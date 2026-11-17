import { cn } from "@/utils/cn";

/** Original V3ST growth contours. Decorative artwork, never an investment chart. */
export function GrowthArtwork({ className }: { className?: string }) {
  return (
    <svg
      className={cn("growth-artwork", className)}
      viewBox="0 0 1440 1000"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="growth-leaf"
          x1="150"
          y1="800"
          x2="1260"
          y2="180"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#B9D987" stopOpacity=".45" />
          <stop offset=".6" stopColor="#E6EEDD" stopOpacity=".35" />
          <stop offset="1" stopColor="#166534" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <path
        d="M-200 1040C-60 630 180 550 440 610C250 780 140 980-200 1040Z"
        fill="url(#growth-leaf)"
      />
      <path
        d="M1510 1070C1120 950 1000 670 1130 300C1370 410 1560 620 1510 1070Z"
        fill="url(#growth-leaf)"
      />
      {Array.from({ length: 9 }, (_, i) => (
        <path
          key={i}
          d={`M${-220 + i * 35} 1040C${-80 + i * 24} ${570 + i * 16} ${240 + i * 20} ${460 + i * 16} ${470 + i * 20} ${610 + i * 13}`}
          stroke="#166534"
          strokeOpacity={0.07 + i * 0.007}
          strokeWidth="1.3"
        />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <path
          key={i}
          d={`M${1520 - i * 22} 1100C${1040 - i * 22} ${950 - i * 13} ${960 + i * 9} ${590 - i * 15} ${1140 + i * 18} ${260 + i * 6}`}
          stroke="#166534"
          strokeOpacity=".12"
          strokeWidth="1.3"
        />
      ))}
      <path
        d="M-100 1000C330 830 510 860 800 1000"
        stroke="#166534"
        strokeOpacity=".08"
      />
    </svg>
  );
}
