import type { Metadata } from "next";

import { WaitlistForm } from "@/components/landing/waitlist-form";
import { waitlistStatusCopy } from "@/components/landing/waitlist-status";
import { cn } from "@/utils/cn";

export const metadata: Metadata = {
  title: "Waitlist · V3ST",
  robots: { index: false, follow: false },
};

// The result page for native (no-JavaScript) waitlist posts: it reads
// ?status= and shows the matching copy above the form again for retries.
export default async function WaitlistPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.status;
  const copy = waitlistStatusCopy(typeof raw === "string" ? raw : undefined);
  return (
    <section className="waitlist-page shell" aria-labelledby="waitlist-title">
      <h1 id="waitlist-title" className="type-h2">
        Join the waitlist
      </h1>
      {copy ? (
        <p role="status" className={cn("waitlist-page-status", `waitlist-${copy.tone}`)}>
          {copy.message}
        </p>
      ) : null}
      <WaitlistForm source="waitlist_page" inputId="waitlist-email" />
    </section>
  );
}
