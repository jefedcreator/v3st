-- Versioned customer document acceptances.

CREATE TABLE "agreement_acceptances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agreement_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agreement_acceptances_userId_document_version_key" ON "agreement_acceptances"("userId", "document", "version");
