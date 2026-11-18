import { existsSync } from "node:fs";
import path from "node:path";

import * as React from "react";

import Image from "next/image";

import type { BuiltWithBrand } from "./brand-catalogue";

// One mark in the "Built to work with" row. When the file is missing from
// public/, the brand's name renders as text instead. The filtered-white
// treatment is the uniform filter to white the spec allows where a brand
// provides no light variant.
export function BrandMark(props: { brand: BuiltWithBrand }): React.JSX.Element {
  const { brand } = props;
  const fileExists = existsSync(path.join(process.cwd(), "public", brand.src));
  if (!fileExists) {
    return <span className="landing-brand-name">{brand.name}</span>;
  }
  const style: React.CSSProperties = {};
  if (brand.treatment === "filtered-white") style.filter = "brightness(0) invert(1)";
  return (
    <span className="landing-brand-mark" style={style}>
      <Image
        src={brand.src}
        alt={`${brand.name} logo`}
        width={brand.width}
        height={brand.height}
        unoptimized
        className="landing-brand-image"
      />
      {brand.symbolOnly ? <span className="landing-brand-name">{brand.name}</span> : null}
    </span>
  );
}
