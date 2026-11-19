// The SVG line for a price chart. Two points or more, drawn with linear
// time on x and 8% padding bands on y; a flat series sits at half height.
export function chartPath(
  points: { t: string; price_kobo: string }[],
  width: number,
  height: number,
): { d: string; first: string; last: string; min: string; max: string } | null {
  if (points.length < 2) return null;

  const xs = points.map((p) => new Date(p.t).getTime());
  const ys = points.map((p) => Number(BigInt(p.price_kobo)));
  const t0 = xs[0]!;
  const t1 = xs[xs.length - 1]!;
  const min = Math.min(...ys);
  const max = Math.max(...ys);

  function coord(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    const text = rounded.toFixed(1).replace(/\.0$/, "");
    return text;
  }

  const d = points
    .map((p, i) => {
      const x = t1 === t0 ? 0 : ((xs[i]! - t0) / (t1 - t0)) * width;
      let y: number;
      if (max === min) {
        y = height / 2;
      } else {
        y = (height - 0.08 * height) - ((ys[i]! - min) / (max - min)) * (height - 0.16 * height);
      }
      return `${i === 0 ? "M" : "L"}${coord(x)},${coord(y)}`;
    })
    .join(" ");

  return {
    d,
    first: points[0]!.price_kobo,
    last: points[points.length - 1]!.price_kobo,
    min: String(min),
    max: String(max),
  };
}
