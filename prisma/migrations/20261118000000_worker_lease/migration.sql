-- Short-lived worker leases: a long job (the Base Sepolia keeper) holds a lease row
-- instead of an open transaction while it waits on chain calls. A lease that its
-- holder never released expires on its own.

CREATE TABLE "worker_leases" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_leases_pkey" PRIMARY KEY ("name")
);
