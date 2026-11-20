"use client";

import { useQuery } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppDocumentSlug } from "@/types/app";
import { DocumentBody } from "@/components/landing/document-body";
import { parseDocument } from "@/components/landing/markdown-lite";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@/primitives";

function useDocument(slug: AppDocumentSlug) {
  return useQuery({
    queryKey: appKeys.document(slug),
    queryFn: () => appApi.documents.get(slug),
    staleTime: 5 * 60_000,
  });
}

// The document body inside the app: the landing's parser and renderer at a
// lower heading level, styled for reading in a sheet.
export function DocumentContent({ slug }: { slug: AppDocumentSlug }) {
  const { data, error } = useDocument(slug);
  if (error !== null) {
    return (
      <p role="status" className="text-loss text-sm">
        {error instanceof AppApiError ? error.message : "We couldn't load this document."}
      </p>
    );
  }
  if (data === undefined) {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }
  return (
    <div className="text-ink flex flex-col gap-4 text-base leading-[1.7] [&_h3]:type-app-heading [&_h3]:text-heading [&_h3:not(:first-child)]:mt-2 [&_li]:leading-[1.7] [&_strong]:text-heading [&_strong]:font-semibold [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5">
      <DocumentBody blocks={parseDocument(data.body)} headingLevel={3} />
    </div>
  );
}

export function DocumentDialog({
  slug,
  open,
  onOpenChange,
  version,
}: {
  slug: AppDocumentSlug;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version?: string;
}) {
  const { data } = useDocument(slug);
  const shownVersion = data?.version ?? version;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{data?.title ?? "Document"}</DialogTitle>
          <DialogDescription>
            {shownVersion === undefined ? "Loading the latest version." : `Version ${shownVersion}`}
          </DialogDescription>
        </DialogHeader>
        <DocumentContent slug={slug} />
      </DialogContent>
    </Dialog>
  );
}
