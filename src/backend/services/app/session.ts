import type { AuthenticatedUser } from "@/backend/middleware/types";
import { APP_BETA_NOTICE, type AppBetaDto, type AppSessionDto } from "@/types/app";

import { firstNameOf } from "./format";

class AppSessionService {
  async get(user: AuthenticatedUser | null): Promise<AppSessionDto> {
    const beta: AppBetaDto = { test_money: true, notice: APP_BETA_NOTICE };
    if (!user) {
      return { signed_in: false, beta };
    }
    return {
      signed_in: true,
      customer: { first_name: firstNameOf(user.verifiedName), email: user.email },
      beta,
    };
  }
}

export const appSessionService = new AppSessionService();
