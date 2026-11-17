import type { AuthenticatedUser } from "@/backend/middleware/types";
import { APP_BETA_NOTICE, type AppBetaDto, type AppSessionDto } from "@/types/app";

import { firstNameOf } from "./format";
import { appInboxService } from "./inbox";
import { appOnboardingService } from "./onboarding";

class AppSessionService {
  async get(user: AuthenticatedUser | null): Promise<AppSessionDto> {
    const beta: AppBetaDto = { test_money: true, notice: APP_BETA_NOTICE };
    if (!user) {
      return { signed_in: false, beta };
    }
    const onboarding = await appOnboardingService.status(user.id);
    return {
      signed_in: true,
      customer: {
        first_name: firstNameOf(user.verifiedName),
        display_name: user.preferredName ?? firstNameOf(user.verifiedName),
        email: user.email,
      },
      onboarding: { complete: onboarding.complete, next_step: onboarding.next_step },
      unread_notifications: await appInboxService.unreadCount(user.id),
      beta,
    };
  }
}

export const appSessionService = new AppSessionService();
