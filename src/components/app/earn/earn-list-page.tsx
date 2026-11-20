"use client";

import Link from "next/link";

import type { AppEarningsDto, AppEarnProductDto } from "@/types/app";
import { formatNaira } from "@/utils/format";
import { Badge } from "@/primitives";
import { useEarnProductsQuery } from "@/hooks/app/use-earn";
import { positionView } from "./earn";

// The Earn tab: one card per product, and the earnings link once there is one.
export function EarnListPage({
  products: initial,
  earnings,
}: {
  products: AppEarnProductDto[];
  earnings: AppEarningsDto | null;
}) {
  const { data } = useEarnProductsQuery(initial);
  const products = data ?? initial;
  return (
    <div className="flex flex-col gap-6 pt-4">
      <div className="flex flex-col gap-2">
        <h1 className="type-app-title text-heading">Earn</h1>
        <p className="text-muted-foreground text-[15px]">
          Earn from trading fees on stocks you choose. You can get back less than you put in.
        </p>
      </div>
      {products.length === 0 && (
        <p className="text-muted-foreground text-sm">Earn isn&apos;t available right now.</p>
      )}
      {products.map((product) => {
        const view = positionView(product.position, product.available);
        return (
          <Link
            key={product.id}
            href={`/earn/${product.id}`}
            className="flex flex-col gap-2 rounded-2xl border border-stroke bg-surface p-5 transition-colors hover:bg-surface-raised"
          >
            <span className="text-heading text-[15px] font-medium">{product.title}</span>
            <span className="text-muted-foreground text-sm">{product.summary}</span>
            <span className="text-subtle text-sm">From {formatNaira(product.minimum_kobo)}</span>
            {view.statusText !== null && (
              <Badge variant="secondary" className="self-start">
                {view.statusText}
              </Badge>
            )}
          </Link>
        );
      })}
      {earnings !== null &&
        (earnings.total_earned_kobo !== "0" || earnings.choice !== "unset") && (
          <Link
            href="/earnings"
            className="text-gain text-[15px] underline-offset-4 hover:underline"
          >
            See your earnings
          </Link>
        )}
    </div>
  );
}
