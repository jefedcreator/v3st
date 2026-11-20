import { APP_BETA_NOTICE } from "@/types/app";

export function BetaLine({ notice }: { notice?: string }) {
  return <p className="text-subtle text-[13px] leading-snug">{notice ?? APP_BETA_NOTICE}</p>;
}
