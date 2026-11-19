import Link from "next/link";

import { Button } from "@/primitives";

export default function AppNotFound() {
  return (
    <div className="flex flex-col items-start gap-3 py-16">
      <p className="text-body text-ink">We couldn't find that.</p>
      <Button variant="outline" asChild>
        <Link href="/home">Home</Link>
      </Button>
    </div>
  );
}
