import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CUSTOMER_DOCUMENTS, type DocumentSlug } from "@/backend/content/documents";
import { DocumentBody } from "@/components/landing/document-body";
import { parseDocument } from "@/components/landing/markdown-lite";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(CUSTOMER_DOCUMENTS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = CUSTOMER_DOCUMENTS[slug as DocumentSlug];
  if (!doc) return { title: "Not found · V3ST" };
  return {
    title: `${doc.title} · V3ST`,
    robots: { index: false, follow: false },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = CUSTOMER_DOCUMENTS[slug as DocumentSlug];
  if (!doc) notFound();
  return (
    <article className="legal-page">
      <DocumentBody blocks={parseDocument(doc.body)} />
      <p className="legal-version">Version {doc.version}</p>
    </article>
  );
}
