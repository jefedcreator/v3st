"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { appApi, AppApiError } from "@/utils/app-api";
import { appKeys } from "@/hooks/app/query-keys";
import type { AppDocumentSummaryDto } from "@/types/app";
import { DocumentDialog } from "@/components/app/documents/document-dialog";
import { Button, Checkbox, Label } from "@/primitives";

export function DocumentsStep({
  documents,
  onDone,
}: {
  documents: AppDocumentSummaryDto[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);
  const [accepted, setAccepted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!accepted) return;
    setPending(true);
    setError(null);
    try {
      await appApi.agreements.accept(
        documents.map((doc) => ({ slug: doc.slug, version: doc.version })),
      );
      onDone();
    } catch (caught) {
      if (caught instanceof AppApiError) {
        setError(caught.message);
        if (caught.code === "DOCUMENT_UPDATED") {
          void queryClient.invalidateQueries({ queryKey: appKeys.documents });
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <ul className="flex flex-col gap-2">
        {documents.map((doc) => (
          <li
            key={doc.slug}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-stroke bg-surface px-4"
          >
            <span className="flex flex-col">
              <span className="text-ink font-medium">{doc.title}</span>
              <span className="text-muted-foreground text-sm">Version {doc.version}</span>
            </span>
            {doc.accepted ? (
              <span className="text-gain text-sm">Accepted</span>
            ) : (
              <Button variant="link" size="sm" type="button" onClick={() => setOpenSlug(doc.slug)}>
                Read
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Label
        htmlFor="accept-documents"
        className="flex min-h-11 items-center gap-3 rounded-lg px-1 font-normal"
      >
        <Checkbox
          id="accept-documents"
          checked={accepted}
          onCheckedChange={(checked) => setAccepted(checked === true)}
        />
        I've read and accept these documents
      </Label>
      <Button type="submit" disabled={!accepted || pending}>
        {pending ? "Accepting…" : "Accept and continue"}
      </Button>
      {error !== null && (
        <p role="status" aria-live="polite" className="text-loss text-sm">
          {error}
        </p>
      )}
      {openSlug !== null && (
        <DocumentDialog
          slug={openSlug as AppDocumentSummaryDto["slug"]}
          open={openSlug !== null}
          onOpenChange={(open) => {
            if (!open) setOpenSlug(null);
          }}
        />
      )}
    </form>
  );
}
