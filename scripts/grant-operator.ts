import { db } from "../src/server/db";

async function main(): Promise<void> {
  const phone = process.argv[2];
  if (!phone) {
    console.error("usage: yarn tsx --env-file-if-exists=.env scripts/grant-operator.ts <phone>");
    process.exit(1);
  }
  const user = await db.user.update({
    where: { phone },
    data: { role: "operator" },
  });
  console.log(`user ${user.id} (${user.phone}) is now an operator`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
