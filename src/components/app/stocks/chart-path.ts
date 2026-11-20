// The SVG line for a price chart. Two points or more, drawn with linear
// time on x and 8% padding bands on y; a flat series sits at half height.
export function chartPath(
  points: { t: string; price_kobo: string }[],
  width: number,
  height: number,
): { d: string; first: string; last: string; min: string; max: string } | null {
  if (points.length < 2) return null;

  const xs = points.map((p) => new Date(p.t).getTime());
  // Exact extremes for display; Number() only for plotting.
  const prices = points.map((p) => BigInt(p.price_kobo));
  let minKobo = prices[0]!;
  let maxKobo = prices[0]!;
  for (const price of prices) {
    if (price < minKobo) minKobo = price;
    if (price > maxKobo) maxKobo = price;
  }
  const ys = prices.map((price) => Number(price));
  const t0 = xs[0]!;
  const t1 = xs[xs.length - 1]!;
  const min = Number(minKobo);
  const max = Number(maxKobo);

  function coord(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    const text = rounded.toFixed(1).replace(/\.0$/, "");
    return text;
  }

  const d = points
    .map((p, i) => {
      const x = t1 === t0 ? 0 : ((xs[i]! - t0) / (t1 - t0)) * width;
      let y: number;
      if (maxKobo === minKobo) {
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
    min: minKobo.toString(),
    max: maxKobo.toString(),
  };
}
