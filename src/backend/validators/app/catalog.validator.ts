import { z } from "zod";

export const stockListQuerySchema = z
  .object({
    q: z.string().max(40).optional(),
    watchlist: z.enum(["true"]).optional(),
  })
  .strict();
export type StockListQuerySchema = z.infer<typeof stockListQuerySchema>;

export const chartQuerySchema = z
  .object({
    range: z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"]).default("1D"),
  })
  .strict();
export type ChartQuerySchema = z.infer<typeof chartQuerySchema>;
