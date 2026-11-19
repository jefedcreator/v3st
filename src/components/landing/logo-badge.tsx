import { existsSync } from "node:fs";
import path from "node:path";

import * as React from "react";

import Image from "next/image";

// A 40px circular badge for a profiled stock. When the logo file is missing
// from public/, the ticker letters render instead, so deleting a file is the
// whole removal procedure for a brand that objects. Pass the company name as
// `alt` (the spec's alt text for stock badges); the ticker is the fallback.
export function LogoBadge(props: {
  ticker: string;
  logoPath: string;
  size?: number;
  alt?: string;
}): React.JSX.Element {
  const size = props.size ?? 40;
  const fileExists = existsSync(path.join(process.cwd(), "public", props.logoPath));
  if (fileExists) {
    return (
      <span
        aria-hidden="true"
        className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-white"
        style={{ width: size, height: size }}
      >
        <Image
          src={props.logoPath}
          alt={props.alt ?? props.ticker}
          width={Math.round(size * 0.62)}
          height={Math.round(size * 0.62)}
          unoptimized
          className="max-h-[62%] w-auto max-w-[62%] object-contain"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full bg-surface-raised text-[10px] font-semibold tracking-wide text-ink"
      style={{ width: size, height: size }}
    >
      {props.ticker}
    </span>
  );
}
