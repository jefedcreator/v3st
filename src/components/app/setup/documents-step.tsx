"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "@phosphor-icons/react/dist/ssr";

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
  const router = useRouter();
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
          // The versions on screen are out of date: reload them from the
          // server and ask for a fresh acceptance.
          void queryClient.invalidateQueries({ queryKey: appKeys.documents });
          setAccepted(false);
          router.refresh();
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
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-stroke bg-surface py-2 pr-1 pl-4"
          >
            <span className="flex flex-col">
              <span className="text-ink font-medium">{doc.title}</span>
              <span className="text-muted-foreground text-sm">Version {doc.version}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {doc.accepted && (
                <span className="text-gain flex items-center gap-1 text-sm">
                  <Check className="size-4" aria-hidden="true" />
                  Accepted
                </span>
              )}
              <Button variant="link" size="sm" type="button" onClick={() => setOpenSlug(doc.slug)}>
                Read<span className="sr-only"> {doc.title}</span>
              </Button>
            </span>
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
        I&apos;ve read and accept these documents
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
