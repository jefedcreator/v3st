import { beforeEach } from "vitest";

import { PrismaClient } from "../../generated/prisma";

const prisma = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `;
  const tables = rows
    .map((row) => row.tablename)
    .filter((name) => name !== "_prisma_migrations");
  if (tables.length === 0) return;
  const quoted = tables.map((name) => `"${name.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
}

export function useTestDatabase(): void {
  beforeEach(async () => {
    await resetDatabase();
  });
}
