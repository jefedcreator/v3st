"use client";

import { useQuery } from "@tanstack/react-query";

import { appApi } from "@/utils/app-api";
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
} from "@/primitives";

// The document body inside the app, kept in sync by query.
export function DocumentContent({ slug }: { slug: AppDocumentSlug }) {
  const { data } = useQuery({
    queryKey: appKeys.document(slug),
    queryFn: () => appApi.documents.get(slug),
  });
  if (data === undefined) return null;
  const blocks = parseDocument(data.body);
  return (
    <div className="text-[16px]">
      <DocumentBody blocks={blocks} headingLevel={3} />
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
  const { data } = useQuery({
    queryKey: appKeys.document(slug),
    queryFn: () => appApi.documents.get(slug),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{data?.title ?? ""}</DialogTitle>
          <DialogDescription>Version {data?.version ?? version ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <DocumentContent slug={slug} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
