import { BetaPolicyError } from "@/backend/integrations/beta-policy";

import type { RampProvider } from "./types";

export function createYellowcardSandboxProvider(): RampProvider {
  throw new BetaPolicyError(
    "The Yellow Card sandbox adapter is not part of this build (added by the webhook task)",
  );
}
