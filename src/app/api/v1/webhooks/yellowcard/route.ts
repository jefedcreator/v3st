import { withMiddleware } from "@/backend/middleware";
import { webhookService } from "@/backend/services/webhooks";
import { ok } from "@/utils/response";

export const POST = withMiddleware<Uint8Array, null, null>(
  async (req) => {
    const result = await webhookService.accept(
      "yellowcard",
      req.headers,
      req.rawBody ?? new Uint8Array(),
    );
    return ok({ duplicate: result.duplicate }, "Accepted");
  },
  [],
  { bodyMode: "raw" },
);
